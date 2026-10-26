export type FormState = { error: string; notice?: string; link?: string; step?: "password" | "totp" };

export const emptyForm: FormState = { error: "" };
