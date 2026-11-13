import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Permission } from './permission.entity.js';
import { Role } from './role.entity.js';

// What a role holds.
@Entity({ name: 'role_has_permissions' })
@Index('role_has_permissions_permission_index', ['permissionId'])
export class RolePermission {
  @PrimaryColumn({ type: 'uuid' })
  roleId: string;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @PrimaryColumn({ type: 'uuid' })
  permissionId: string;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;
}
