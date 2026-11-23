
export type MunicipalProfile = "ADMIN" | "PREFEITO" | "SECRETARIO" | "OPERADOR" | "ADMINISTRATIVO";
export type MatrixExperience = "mayor" | "secretary" | "operator";

export type MatrixUser = {
  id: string;
  email: string;
  name: string;
  profile: MunicipalProfile;
  experience: MatrixExperience;
};

export function experienceForProfile(profile?: string | null): MatrixExperience {
  if (profile === "PREFEITO") return "mayor";
  if (profile === "SOLICITANTE" || profile === "ESTAGIARIO" || profile === "OPERADOR") return "operator";
  return "secretary";
}
