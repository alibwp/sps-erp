import {
  CreateDateColumn,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NamesItsOwnSchool } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import { Role } from './role.entity.js';

// A role held by a person. school_id names the campus where a campus role
// is held, so one person can be a teacher at one campus and an admin at
// another; it is null for the two global roles (platform-admin,
// organization-admin).
@NamesItsOwnSchool()
@Entity({ name: 'model_has_roles' })
// Unique (user_id, role_id, school_id) NULLS NOT DISTINCT, created by the
// migration, so a global role cannot be given twice either.
@Index('model_has_roles_unique', { synchronize: false })
@Index('model_has_roles_school_role_index', ['schoolId', 'roleId'])
@Index('model_has_roles_role_index', ['roleId'])
export class RoleAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  roleId: string;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  @ManyToOne(() => School, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'school_id' })
  school: School | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
