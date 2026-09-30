import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const SCRYPT_PREFIX = 'scrypt'
const SCRYPT_KEY_LENGTH = 64
const SCRYPT_COST = 16_384
const SCRYPT_BLOCK_SIZE = 8
const SCRYPT_PARALLELIZATION = 1
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024
const LEGACY_SALT = 'campus_platform_salt_2024'

interface PasswordVerification {
  valid: boolean
  needsRehash: boolean
}

function deriveScryptKey(
  password: string,
  salt: string,
  cost = SCRYPT_COST,
  blockSize = SCRYPT_BLOCK_SIZE,
  parallelization = SCRYPT_PARALLELIZATION
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: cost,
        r: blockSize,
        p: parallelization,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, key) => {
        if (error) reject(error)
        else resolve(key)
      }
    )
  })
}

function safeEqual(actual: Buffer, expected: Buffer): boolean {
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url')
  const derivedKey = await deriveScryptKey(password, salt)
  return [
    SCRYPT_PREFIX,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt,
    derivedKey.toString('base64url'),
  ].join('$')
}

async function verifyScryptPassword(password: string, encodedHash: string): Promise<boolean> {
  const [prefix, costValue, blockSizeValue, parallelizationValue, salt, expectedValue, extra] = encodedHash.split('$')
  if (prefix !== SCRYPT_PREFIX || !salt || !expectedValue || extra) return false

  const cost = Number(costValue)
  const blockSize = Number(blockSizeValue)
  const parallelization = Number(parallelizationValue)
  if (
    cost !== SCRYPT_COST ||
    blockSize !== SCRYPT_BLOCK_SIZE ||
    parallelization !== SCRYPT_PARALLELIZATION
  ) {
    return false
  }

  const expected = Buffer.from(expectedValue, 'base64url')
  const actual = await deriveScryptKey(password, salt, cost, blockSize, parallelization)
  return safeEqual(actual, expected)
}

function verifyLegacyPassword(password: string, encodedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(encodedHash)) return false
  const actual = createHash('sha256').update(`${password}${LEGACY_SALT}`).digest()
  const expected = Buffer.from(encodedHash, 'hex')
  return safeEqual(actual, expected)
}

export async function verifyPassword(password: string, encodedHash: string): Promise<PasswordVerification> {
  if (encodedHash.startsWith(`${SCRYPT_PREFIX}$`)) {
    return {
      valid: await verifyScryptPassword(password, encodedHash),
      needsRehash: false,
    }
  }

  const valid = verifyLegacyPassword(password, encodedHash)
  return { valid, needsRehash: valid }
}
