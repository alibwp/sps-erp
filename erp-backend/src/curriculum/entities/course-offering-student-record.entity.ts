import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { StudentRecord } from '../../enrollments/entities/student-record.entity.js';
import { CourseOffering } from './course-offering.entity.js';

// The named learners of an offering with a named-learner roster (reference
// course_offering_student_records).
@Entity({ name: 'course_offering_student_records' })
@Index('course_offering_student_records_enrollment_index', ['studentRecordId'])
export class CourseOfferingStudentRecord {
  @PrimaryColumn({ type: 'uuid' })
  courseOfferingId: string;

  @ManyToOne(() => CourseOffering, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_offering_id' })
  courseOffering: CourseOffering;

  @PrimaryColumn({ type: 'uuid' })
  studentRecordId: string;

  @ManyToOne(() => StudentRecord, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_record_id' })
  studentRecord: StudentRecord;
}
