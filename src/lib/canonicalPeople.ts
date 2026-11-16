export function digits(value: string) {
  return value.replace(/\D/g, '')
}

export function isValidCpf(value: string) {
  const cpf = digits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  let sum = 0
  for (let index = 0; index < 9; index += 1) sum += Number(cpf[index]) * (10 - index)
  let digit = (sum * 10) % 11
  if (digit === 10) digit = 0
  if (digit !== Number(cpf[9])) return false
  sum = 0
  for (let index = 0; index < 10; index += 1) sum += Number(cpf[index]) * (11 - index)
  digit = (sum * 10) % 11
  if (digit === 10) digit = 0
  return digit === Number(cpf[10])
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
