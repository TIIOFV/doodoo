export type Role = 'administrador'|'gestor'|'coordenador'|'supervisor'|'analista'|'colaborador';
export interface Member { user_id:string; name:string; role:string; isAdmin:boolean; }
export interface ChannelRow { id:string; nome:string; is_group:boolean; is_direct?:boolean; setor?:string; membros:Member[]; foto_url?:string; created_at?:string; }
export interface MessageMetadata extends Record<string, unknown> {
 urgent?:boolean;acknowledgedBy?:string[];
 mediaUrl?:string;storagePath?:string;fileName?:string;fileSize?:string;deleted?:boolean;lidoPor?:string[];acceptedBy?:string[];
 replyTo?:{id:string;sender:string;text:string};eventDetails?:{title:string;date:string;time:string;location:string};
}
export interface MessageRow { id:string;canal_id:string;sender_id:string;sender_nome:string;texto:string;tipo:'text'|'image'|'file'|'event';metadata?:MessageMetadata;created_at:string; }
export interface PermissionRow { aba_key:string;cargos_permitidos:string[];usuarios_permitidos:string[]; }
