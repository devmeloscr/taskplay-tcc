import { z } from 'zod';
import './idioma';

function texto(rotulo: string, pedido: string, max: number) {
  return z
    .string({ error: pedido })
    .trim()
    .min(1, { error: pedido })
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` });
}

const email = z
  .email({
    error: (issue) =>
      issue.input === undefined
        ? 'Informe o e-mail'
        : 'E-mail em formato inválido (exemplo: nome@dominio.com)',
  })
  .max(180, { error: 'O e-mail deve ter no máximo 180 caracteres' });

/** Senha do responsavel. O comprimento minimo e a unica regra de composicao. */
const password = z
  .string({ error: 'Informe a senha' })
  .min(8, { error: 'A senha deve ter ao menos 8 caracteres' })
  .max(128, { error: 'A senha deve ter no máximo 128 caracteres' });

function refreshToken() {
  const ausente = 'Sessão do aparelho ausente ou expirada';
  return z.string({ error: ausente }).min(1, { error: ausente });
}

const pin = z
  .string({ error: 'Informe o PIN' })
  .regex(/^\d{4}$/, { error: 'O PIN deve ter exatamente 4 dígitos' });

export const deviceInfo = z.object(
  {
    label: texto('O nome do aparelho', 'Informe um nome para o aparelho', 80),
    platform: z.enum(['ios', 'android'], {
      error: 'A plataforma do aparelho deve ser "ios" ou "android"',
    }),
    model: z
      .string()
      .max(80, { error: 'O modelo do aparelho deve ter no máximo 80 caracteres' })
      .optional(),
  },
  { error: 'Informe os dados do aparelho' },
);

const acceptedTcleVersion = z
  .string({ error: 'É preciso concordar com o Termo de Consentimento para criar a conta' })
  .min(1, { error: 'É preciso concordar com o Termo de Consentimento para criar a conta' })
  .max(20, { error: 'Versão do Termo de Consentimento inválida' });

/** Cria a familia e o perfil do responsavel. Primeiro uso do aplicativo. */
export const registerRequest = z.object({
  familyName: texto('O nome da família', 'Informe o nome da família', 120),
  name: texto('Seu nome', 'Informe o seu nome', 80),
  email,
  password,
  pin,
  device: deviceInfo,
  acceptedTcleVersion,
});

export const registerForm = registerRequest.omit({ device: true, acceptedTcleVersion: true });

/** Entrada do responsavel num aparelho ainda nao reconhecido. */
export const loginRequest = z.object({
  email,
  password,
  device: deviceInfo,
});

export const tokenScope = z.enum(['full', 'telemetry'], {
  error: 'O escopo do token deve ser "full" ou "telemetry"',
});

/** Selecao de perfil: o refresh token do aparelho troca por um token do perfil. */
export const sessionRequest = z.object({
  refreshToken: refreshToken(),
  userId: z.uuid({ error: 'Perfil inválido' }),
  /** Exigido pelo servidor quando o alvo e um responsavel e o escopo e `full`. */
  pin: pin.optional(),
  scope: tokenScope.default('full'),
});

/** Rotacao do par de tokens do perfil corrente. Nunca troca de perfil. */
export const refreshRequest = z.object({
  refreshToken: refreshToken(),
});

/** Vincula um aparelho proprio de um filho por codigo de convite. */
export const enrollRequest = z.object({
  code: z
    .string({ error: 'Informe o código de convite' })
    .regex(/^[A-Z0-9]{6}$/, {
      error: 'O código de convite tem 6 caracteres, entre letras maiúsculas e números',
    }),
  device: deviceInfo,
});

export const createMemberRequest = z.object({
  name: texto('O nome do filho', 'Informe o nome do filho', 80),
  birthDate: z.iso
    .date({ error: 'A data de nascimento deve estar no formato AAAA-MM-DD' })
    .optional(),
  pin: pin.optional(),
});

export const updateMemberRequest = z
  .object({
    name: texto('O nome do filho', 'Informe o nome do filho', 80).optional(),
    birthDate: z.iso
      .date({ error: 'A data de nascimento deve estar no formato AAAA-MM-DD' })
      .nullable()
      .optional(),
    pin: pin.nullable().optional(),
  })
  // Um corpo vazio chegaria a gravar nada e a responder 200, e a tela mostraria
  // "salvo" sem que nada tivesse sido salvo. Recusar aqui evita a mentira.
  .refine((corpo) => Object.keys(corpo).length > 0, {
    error: 'Informe ao menos um campo para alterar',
  });

export const familyAuditAction = z.enum([
  'MEMBER_CREATED',
  'MEMBER_RENAMED',
  'MEMBER_BIRTH_DATE_CHANGED',
  'MEMBER_PIN_SET',
  'MEMBER_PIN_CHANGED',
  'MEMBER_PIN_REMOVED',
  'MEMBER_DEACTIVATED',
  'MEMBER_REACTIVATED',
]);

export const familyAuditEntry = z.object({
  id: z.uuid(),
  action: familyAuditAction,
  actorId: z.uuid().nullable(),
  actorName: z.string(),
  targetId: z.uuid().nullable(),
  targetName: z.string(),
  field: z.string().nullable(),
  beforeValue: z.string().nullable(),
  afterValue: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const tokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresIn: z.number().int().positive(),
  scope: tokenScope,
});

export const profileSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  role: z.enum(['PARENT', 'CHILD']),
  requiresPin: z.boolean(),
});

export const revokeConsentRequest = z.object({
  password: z.string({ error: 'Informe a senha' }).min(1, { error: 'Informe a senha' }),
  pin,
  confirmacao: z.literal('REMOVER TUDO', {
    error: 'Digite exatamente REMOVER TUDO para confirmar',
  }),
});

export const profileList = z.object({
  profiles: z.array(profileSummary),
});

export type DeviceInfo = z.infer<typeof deviceInfo>;
export type RegisterRequest = z.infer<typeof registerRequest>;
export type RegisterForm = z.infer<typeof registerForm>;
export type LoginRequest = z.infer<typeof loginRequest>;
export type SessionRequest = z.infer<typeof sessionRequest>;
export type RefreshRequest = z.infer<typeof refreshRequest>;
export type EnrollRequest = z.infer<typeof enrollRequest>;
export type CreateMemberRequest = z.infer<typeof createMemberRequest>;
export type UpdateMemberRequest = z.infer<typeof updateMemberRequest>;
export type FamilyAuditAction = z.infer<typeof familyAuditAction>;
export type FamilyAuditEntry = z.infer<typeof familyAuditEntry>;
export type TokenPair = z.infer<typeof tokenPair>;
export type TokenScope = z.infer<typeof tokenScope>;
export type ProfileSummary = z.infer<typeof profileSummary>;
export type RevokeConsentRequest = z.infer<typeof revokeConsentRequest>;
