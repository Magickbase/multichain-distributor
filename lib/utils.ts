import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function assert<T>(value: T, message: string): asserts value {
  if (!value) {
    throw new Error(message)
  }
}

export function trunkHash(hash: string, start = 6, end = 6) {
  return hash.slice(0, start) + '...' + hash.slice(-end)
}
