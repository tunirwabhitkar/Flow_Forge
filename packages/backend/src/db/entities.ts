import 'reflect-metadata';
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  JoinColumn,
  Index,
} from 'typeorm';

// ─── User Entity ─────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

@Entity('users')
export class UserEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column({ unique: true })
  @Index()
  email!: string;

  @Column({ nullable: true, select: false })
  passwordHash?: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column({ default: 'member' })
  role!: UserRole;

  @Column({ default: false })
  emailVerified!: boolean;

  @Column({ nullable: true, select: false })
  totpSecret?: string;

  @Column({ default: false })
  mfaEnabled!: boolean;

  @Column({ nullable: true, type: 'simple-json' })
  settings?: Record<string, unknown>;

  @Column({ nullable: true })
  personalizationAnswers?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => ProjectMemberEntity, (pm) => pm.user)
  projectMemberships!: ProjectMemberEntity[];

  @OneToMany(() => ApiKeyEntity, (ak) => ak.user)
  apiKeys!: ApiKeyEntity[];
}

// ─── Project Entity ──────────────────────────────────────────────────────────

@Entity('projects')
export class ProjectEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: 'personal' })
  type!: 'personal' | 'team';

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => ProjectMemberEntity, (pm) => pm.project)
  members!: ProjectMemberEntity[];

  @OneToMany(() => WorkflowEntity, (w) => w.project)
  workflows!: WorkflowEntity[];

  @OneToMany(() => CredentialEntity, (c) => c.project)
  credentials!: CredentialEntity[];
}

@Entity('project_members')
export class ProjectMemberEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @ManyToOne(() => ProjectEntity, (p) => p.members)
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({ name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => UserEntity, (u) => u.projectMemberships)
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ default: 'member' })
  role!: UserRole;

  @CreateDateColumn()
  createdAt!: Date;
}

// ─── Workflow Entity ─────────────────────────────────────────────────────────

@Entity('workflows')
@Index(['projectId'])
export class WorkflowEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column()
  name!: string;

  @Column({ default: false })
  active!: boolean;

  @Column({ type: 'text' })
  nodes!: string; // JSON

  @Column({ type: 'text' })
  connections!: string; // JSON

  @Column({ type: 'text', nullable: true })
  settings?: string; // JSON

  @Column({ type: 'text', nullable: true })
  staticData?: string; // JSON

  @Column({ nullable: true })
  versionId?: string;

  @Column({ nullable: true })
  triggerCount?: number;

  @Column({ name: 'project_id', nullable: true })
  projectId?: string;

  @ManyToOne(() => ProjectEntity, (p) => p.workflows, { nullable: true })
  @JoinColumn({ name: 'project_id' })
  project?: ProjectEntity;

  @Column({ name: 'owner_id', nullable: true })
  ownerId?: string;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner?: UserEntity;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;

  @OneToMany(() => WorkflowVersionEntity, (v) => v.workflow)
  versions!: WorkflowVersionEntity[];

  @OneToMany(() => ExecutionEntity, (e) => e.workflow)
  executions!: ExecutionEntity[];

  @OneToMany(() => WebhookEntity, (wh) => wh.workflow)
  webhooks!: WebhookEntity[];

  @OneToMany(() => TagWorkflowEntity, (tw) => tw.workflow)
  tagMappings!: TagWorkflowEntity[];
}

@Entity('workflow_versions')
@Index(['workflowId'])
export class WorkflowVersionEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column({ name: 'workflow_id' })
  workflowId!: string;

  @ManyToOne(() => WorkflowEntity, (w) => w.versions)
  @JoinColumn({ name: 'workflow_id' })
  workflow!: WorkflowEntity;

  @Column({ type: 'text' })
  nodes!: string;

  @Column({ type: 'text' })
  connections!: string;

  @Column({ type: 'text', nullable: true })
  settings?: string;

  @Column({ nullable: true })
  versionId?: string;

  @Column({ nullable: true })
  createdBy?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

// ─── Credential Entity ───────────────────────────────────────────────────────

@Entity('credentials')
@Index(['projectId'])
export class CredentialEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column()
  name!: string;

  @Column()
  type!: string;

  @Column({ type: 'text' })
  data!: string; // AES-256-GCM encrypted JSON

  @Column({ nullable: true })
  iv?: string;

  @Column({ nullable: true })
  authTag?: string;

  @Column({ name: 'project_id', nullable: true })
  projectId?: string;

  @ManyToOne(() => ProjectEntity, (p) => p.credentials, { nullable: true })
  @JoinColumn({ name: 'project_id' })
  project?: ProjectEntity;

  @Column({ name: 'owner_id', nullable: true })
  ownerId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

// ─── Execution Entity ────────────────────────────────────────────────────────

@Entity('executions')
@Index(['workflowId'])
@Index(['status'])
@Index(['startedAt'])
export class ExecutionEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column({ name: 'workflow_id' })
  workflowId!: string;

  @ManyToOne(() => WorkflowEntity, (w) => w.executions, { nullable: true })
  @JoinColumn({ name: 'workflow_id' })
  workflow?: WorkflowEntity;

  @Column({ default: 'new' })
  status!: string;

  @Column({ default: 'manual' })
  mode!: string;

  @Column({ nullable: true })
  retryOf?: string;

  @Column({ nullable: true })
  retrySuccessId?: string;

  @Column({ nullable: true })
  waitTill?: Date;

  @Column({ type: 'text', nullable: true })
  data?: string; // JSON – stored compressed for large executions

  @Column({ type: 'text', nullable: true })
  workflowData?: string; // Snapshot of workflow at execution time

  @Column({ type: 'text', nullable: true })
  customData?: string;

  @CreateDateColumn({ name: 'started_at' })
  startedAt!: Date;

  @Column({ name: 'stopped_at', nullable: true })
  stoppedAt?: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}

// ─── Webhook Entity ──────────────────────────────────────────────────────────

@Entity('webhooks')
@Index(['path', 'method'], { unique: true })
export class WebhookEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column({ name: 'workflow_id' })
  workflowId!: string;

  @ManyToOne(() => WorkflowEntity, (w) => w.webhooks)
  @JoinColumn({ name: 'workflow_id' })
  workflow!: WorkflowEntity;

  @Column()
  nodeId!: string;

  @Column()
  nodeName!: string;

  @Column()
  webhookPath!: string;

  @Column()
  method!: string;

  @Column({ default: 'production' })
  webhookType!: 'production' | 'test' | 'form';

  @Column({ nullable: true })
  pathLength?: number;

  @CreateDateColumn()
  createdAt!: Date;
}

// ─── API Key Entity ──────────────────────────────────────────────────────────

@Entity('api_keys')
@Index(['keyHash'], { unique: true })
export class ApiKeyEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, (u) => u.apiKeys)
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column()
  label!: string;

  @Column({ select: false })
  keyHash!: string;

  @Column({ type: 'simple-json', nullable: true })
  scopes?: string[];

  @Column({ nullable: true })
  expiresAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ nullable: true })
  lastUsedAt?: Date;
}

// ─── Tag Entity ──────────────────────────────────────────────────────────────

@Entity('tags')
@Index(['name'], { unique: true })
export class TagEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column()
  name!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => TagWorkflowEntity, (tw) => tw.tag)
  workflowMappings!: TagWorkflowEntity[];
}

@Entity('tag_workflows')
export class TagWorkflowEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column({ name: 'tag_id' })
  tagId!: string;

  @ManyToOne(() => TagEntity, (t) => t.workflowMappings)
  @JoinColumn({ name: 'tag_id' })
  tag!: TagEntity;

  @Column({ name: 'workflow_id' })
  workflowId!: string;

  @ManyToOne(() => WorkflowEntity, (w) => w.tagMappings)
  @JoinColumn({ name: 'workflow_id' })
  workflow!: WorkflowEntity;
}

// ─── Installed Node Entity ───────────────────────────────────────────────────

@Entity('installed_nodes')
export class InstalledNodeEntity {
  @PrimaryColumn('varchar', { length: 255 })
  id!: string;

  @Column()
  packageName!: string;

  @Column()
  version!: string;

  @Column({ type: 'simple-json', nullable: true })
  nodeNames?: string[];

  @CreateDateColumn()
  createdAt!: Date;
}
