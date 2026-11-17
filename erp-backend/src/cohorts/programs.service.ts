import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager, In } from 'typeorm';
import { AcademicPeriodContext } from '../academic/academic-period-context.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import {
  RuleViolation,
  ValidationFailed,
} from '../common/errors/api-exception.js';
import { postgresCode } from '../common/errors/error-response.js';
import { findInSchool } from '../common/tenancy/school-scope.js';
import { StudentRecord } from '../enrollments/entities/student-record.entity.js';
import { School } from '../organizations/entities/school.entity.js';
import {
  PROGRAM_SUBJECT,
  type ParticipationStatus,
  type ProgramType,
  RUNNING_PARTICIPATION,
  canMoveParticipation,
  isRunning,
  participationLabel,
} from './cohorts.constants.js';
import { ProgramParticipation } from './entities/program-participation.entity.js';
import { Program } from './entities/program.entity.js';

export const PROGRAM_NOT_FOUND = 'Programme not found.';
export const PLACE_NOT_FOUND = 'Place not found.';

export const ProgramMessages = {
  nameTaken: 'This school already has a programme with that name.',
  ownSchool: 'A student can only join a programme in their own school.',
  closed: 'This programme is closed.',
  needsActive: 'A programme needs an active enrollment.',
  anotherPlace: 'The learner already holds another place in this programme.',
  movedMeanwhile: (status: ParticipationStatus) =>
    `Somebody else already moved this place to ${participationLabel(status)}.`,
  cannotMove: (from: ParticipationStatus, to: ParticipationStatus) =>
    `A place cannot move from ${participationLabel(from)} to ${participationLabel(to)}.`,
  staff: 'The selected staff id is invalid.',
} as const;

export interface ProgramInput {
  name?: string;
  type?: ProgramType;
  description?: string | null;
  isActive?: boolean;
}

// Programmes of a campus and learners' places in them (reference
// SaveProgram, ChangeProgramParticipation, ProgramPolicy). A place runs
// requested → active or withdrawn; active → completed or withdrawn;
// withdrawn → active again; completed is final.
@Injectable()
export class Programs {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly periods: AcademicPeriodContext,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  list(
    schoolId: string,
    filter: { type?: ProgramType; activeOnly?: boolean } = {},
  ): Promise<Program[]> {
    return this.dataSource.manager.find(Program, {
      where: {
        schoolId,
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.activeOnly ? { isActive: true } : {}),
      },
      order: { name: 'ASC' },
    });
  }

  find(
    schoolId: string,
    id: string,
    manager: EntityManager = this.dataSource.manager,
    lock = false,
  ): Promise<Program> {
    return findInSchool(
      manager,
      Program,
      { id },
      { schoolId, lock, notFound: PROGRAM_NOT_FOUND },
    );
  }

  places(
    programId: string,
    filter: { status?: ParticipationStatus } = {},
  ): Promise<ProgramParticipation[]> {
    return this.dataSource.manager.find(ProgramParticipation, {
      where: { programId, ...(filter.status ? { status: filter.status } : {}) },
      relations: { studentRecord: { user: true }, staff: true },
      withDeleted: true,
      order: { createdAt: 'ASC' },
    });
  }

  async place(programId: string, id: string): Promise<ProgramParticipation> {
    const place = await this.dataSource.manager.findOne(ProgramParticipation, {
      where: { id, programId },
      relations: { studentRecord: { user: true }, staff: true },
      withDeleted: true,
    });
    if (!place) throw new NotFoundException(PLACE_NOT_FOUND);
    return place;
  }

  async create(
    actorId: string,
    schoolId: string,
    input: ProgramInput & { name: string; type: ProgramType },
  ): Promise<Program> {
    return this.saving(async (manager) => {
      await this.lockSchool(manager, schoolId);
      const name = input.name.trim();
      await this.refuseATakenName(manager, schoolId, name);
      const program = await manager.save(
        manager.create(Program, {
          schoolId,
          name,
          type: input.type,
          description: input.description?.trim() || null,
          isActive: input.isActive ?? true,
        }),
      );
      await this.record(manager, program, { created: true });
      return program;
    });
  }

  async update(
    actorId: string,
    schoolId: string,
    id: string,
    input: ProgramInput,
  ): Promise<Program> {
    return this.saving(async (manager) => {
      await this.lockSchool(manager, schoolId);
      const program = await this.find(schoolId, id, manager, true);
      const name = input.name?.trim() ?? program.name;
      await this.refuseATakenName(manager, schoolId, name, program.id);
      const next = {
        name,
        type: input.type ?? program.type,
        description:
          input.description === undefined
            ? program.description
            : input.description?.trim() || null,
        isActive: input.isActive ?? program.isActive,
      };
      const changed = (Object.keys(next) as Array<keyof typeof next>).filter(
        (field) => next[field] !== program[field],
      );
      if (!changed.length) return program;
      Object.assign(program, next);
      const saved = await manager.save(program);
      await this.record(manager, saved, { changed });
      return saved;
    });
  }

  // A place for a learner of this campus with an active enrollment, in an
  // open programme; joining again returns the running place.
  async join(
    actorId: string,
    school: School,
    programId: string,
    input: {
      studentId: string;
      startsOn?: string | null;
      schedule?: string | null;
      staffId?: string | null;
    },
  ): Promise<{ place: ProgramParticipation; created: boolean }> {
    try {
      return await this.transactions.run(async (tx) => {
        const manager = tx.manager;
        const program = await this.find(school.id, programId, manager, true);
        const enrollment = await manager.findOne(StudentRecord, {
          where: { id: input.studentId },
        });
        if (!enrollment) throw new NotFoundException('Student not found.');
        this.refuseAClosedDoor(program, enrollment);
        const running = await this.runningPlace(
          manager,
          program.id,
          enrollment.id,
        );
        if (running) return { place: running, created: false };
        if (
          input.staffId &&
          !(await this.worksHere(manager, input.staffId, school.id))
        ) {
          throw new ValidationFailed({ staffId: [ProgramMessages.staff] });
        }
        const working = await this.periods.resolve(
          actorId,
          school,
          undefined,
          manager,
        );
        const place = await manager.save(
          manager.create(ProgramParticipation, {
            schoolId: school.id,
            programId: program.id,
            studentRecordId: enrollment.id,
            status: 'requested',
            startsOn: input.startsOn ?? this.clock.schoolToday(school.timezone),
            schedule: input.schedule?.trim() || null,
            staffId: input.staffId ?? null,
            academicYearId: working.academicYear?.id ?? null,
          }),
        );
        await this.record(
          manager,
          program,
          {
            participation_id: place.id,
            student_record_id: enrollment.id,
            status: place.status,
          },
          AuditAction.ProgramParticipationChanged,
        );
        return { place, created: true };
      });
    } catch (error) {
      if (postgresCode(error) !== '23505') throw error;
      const place = await this.dataSource.manager.findOne(
        ProgramParticipation,
        {
          where: {
            programId,
            studentRecordId: input.studentId,
            status: In([...RUNNING_PARTICIPATION]),
          },
        },
      );
      if (!place) throw error;
      return { place, created: false };
    }
  }

  // Moves a place on. `seen` is the status the person saw: when somebody
  // else changed the place meanwhile, the change is refused with the
  // status it has now.
  async changeStatus(
    actorId: string,
    schoolId: string,
    programId: string,
    id: string,
    input: {
      status: ParticipationStatus;
      seen: ParticipationStatus;
      note?: string | null;
    },
  ): Promise<ProgramParticipation> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const program = await this.find(schoolId, programId, manager, true);
      const place = await manager.findOne(ProgramParticipation, {
        where: { id, programId: program.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!place) throw new NotFoundException(PLACE_NOT_FOUND);
      if (place.status !== input.seen) {
        throw new RuleViolation(ProgramMessages.movedMeanwhile(place.status));
      }
      return this.changeIn(
        manager,
        program,
        place,
        input.status,
        input.note ?? null,
        actorId,
      );
    });
  }

  // Every running place of the learner at a campus ends (an enrollment
  // closing, a move to another campus): completed when the learner
  // finished (graduated) and was taking part, otherwise withdrawn.
  async withdrawFromSchoolIn(
    manager: EntityManager,
    enrollmentId: string,
    schoolId: string,
    note: string,
    actorId: string | null,
    finished = false,
  ): Promise<number> {
    const places = await manager.find(ProgramParticipation, {
      where: {
        schoolId,
        studentRecordId: enrollmentId,
        status: In([...RUNNING_PARTICIPATION]),
      },
      lock: { mode: 'pessimistic_write' },
    });
    for (const place of places) {
      const program = await manager.findOneOrFail(Program, {
        where: { id: place.programId },
      });
      const ending =
        finished && place.status === 'active' ? 'completed' : 'withdrawn';
      await this.changeIn(manager, program, place, ending, note, actorId);
    }
    return places.length;
  }

  private async changeIn(
    manager: EntityManager,
    program: Program,
    place: ProgramParticipation,
    status: ParticipationStatus,
    note: string | null,
    actorId: string | null,
  ): Promise<ProgramParticipation> {
    const current = place.status;
    if (current === status) return place;
    if (!canMoveParticipation(current, status)) {
      throw new RuleViolation(ProgramMessages.cannotMove(current, status));
    }
    if (isRunning(status) && !isRunning(current)) {
      const enrollment = await manager.findOneOrFail(StudentRecord, {
        where: { id: place.studentRecordId },
      });
      this.refuseAClosedDoor(program, enrollment);
      if (await this.runningPlace(manager, program.id, enrollment.id)) {
        throw new RuleViolation(ProgramMessages.anotherPlace);
      }
    }
    place.status = status;
    place.note = note?.trim() || place.note;
    if (!isRunning(status) && place.endsOn === null) {
      const today = await this.today(manager, program.schoolId);
      place.endsOn =
        place.startsOn !== null && place.startsOn > today
          ? place.startsOn
          : today;
    }
    if (isRunning(status)) place.endsOn = null;
    const saved = await manager.save(place);
    await this.record(
      manager,
      program,
      {
        participation_id: place.id,
        student_record_id: place.studentRecordId,
        from: current,
        status,
      },
      AuditAction.ProgramParticipationChanged,
      actorId,
    );
    return saved;
  }

  private refuseAClosedDoor(program: Program, enrollment: StudentRecord): void {
    if (program.schoolId !== enrollment.schoolId) {
      throw new RuleViolation(ProgramMessages.ownSchool);
    }
    if (!program.isActive) throw new RuleViolation(ProgramMessages.closed);
    if (enrollment.status !== 'active') {
      throw new RuleViolation(ProgramMessages.needsActive);
    }
  }

  private runningPlace(
    manager: EntityManager,
    programId: string,
    enrollmentId: string,
  ): Promise<ProgramParticipation | null> {
    return manager.findOne(ProgramParticipation, {
      where: {
        programId,
        studentRecordId: enrollmentId,
        status: In([...RUNNING_PARTICIPATION]),
      },
    });
  }

  // A member of the campus holding a staff role there.
  private async worksHere(
    manager: EntityManager,
    userId: string,
    schoolId: string,
  ): Promise<boolean> {
    const [row] = (await manager.query(
      `SELECT EXISTS (
         SELECT 1 FROM model_has_roles a
           JOIN roles r ON r.id = a.role_id
           JOIN school_memberships m
             ON m.user_id = a.user_id AND m.school_id = a.school_id AND m.status = 'active'
          WHERE a.user_id = $1 AND a.school_id = $2 AND r.name NOT IN ('student', 'parent')
       ) AS works`,
      [userId, schoolId],
    )) as Array<{ works: boolean }>;
    return row.works;
  }

  private async refuseATakenName(
    manager: EntityManager,
    schoolId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const taken = await manager
      .createQueryBuilder(Program, 'program')
      .where('program.schoolId = :schoolId', { schoolId })
      .andWhere('lower(program.name) = lower(:name)', { name })
      .andWhere(exceptId ? 'program.id <> :exceptId' : 'TRUE', { exceptId })
      .getExists();
    if (taken) throw new RuleViolation(ProgramMessages.nameTaken);
  }

  private async saving<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.transactions.run((tx) => work(tx.manager));
    } catch (error) {
      if (postgresCode(error) === '23505') {
        throw new RuleViolation(ProgramMessages.nameTaken);
      }
      throw error;
    }
  }

  private async lockSchool(
    manager: EntityManager,
    schoolId: string,
  ): Promise<void> {
    await manager.findOne(School, {
      where: { id: schoolId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private async today(
    manager: EntityManager,
    schoolId: string,
  ): Promise<string> {
    const school = await manager.findOneOrFail(School, {
      where: { id: schoolId },
    });
    return this.clock.schoolToday(school.timezone);
  }

  private async record(
    manager: EntityManager,
    program: Program,
    context: Record<string, unknown>,
    action:
      | typeof AuditAction.ProgramChanged
      | typeof AuditAction.ProgramParticipationChanged = AuditAction.ProgramChanged,
    actorId?: string | null,
  ): Promise<void> {
    await this.audit.record(manager, {
      action,
      subject: { type: PROGRAM_SUBJECT, id: program.id },
      context,
      schoolId: program.schoolId,
      ...(actorId === null ? { actorId } : {}),
    });
  }
}
