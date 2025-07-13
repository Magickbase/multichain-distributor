import type {
  TransferedAggrBurnRecord,
  UntransferedAggrBurnRecord,
} from './csv-types'

const TRANSFER_RECORD = '@@transfer_record'

export function getCacheTransferRecord() {
  const json = window.localStorage.getItem(TRANSFER_RECORD)
  if (!json) return undefined
  try {
    return JSON.parse(json) as TransferedAggrBurnRecord[]
  } catch {
    return undefined
  }
}

export function saveCacheTransferRecord(records: UntransferedAggrBurnRecord[]) {
  window.localStorage.setItem(TRANSFER_RECORD, JSON.stringify(records))
}

export function updateCacheTransferRecord(
  record: TransferedAggrBurnRecord,
  index: number,
) {
  const records = getCacheTransferRecord()
  if (!records || records.length <= index)
    throw new Error(
      `No cache records, can not update record at index ${index}, records length is ${records?.length}`,
    )
  records[index] = record
  saveCacheTransferRecord(records)
}
