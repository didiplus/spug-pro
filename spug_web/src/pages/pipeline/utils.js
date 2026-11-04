import lds from 'lodash'

export function transfer(data) {
  if (data.length === 0) return []

  const nodes = {}
  for (const item of data) {
    nodes[item.id] = item
  }

  let response = []
  let layer = 0

  function loop(keys) {
    const tmp = []
    let downKeys = []
    for (const key of keys) {
      const node = nodes[key]
      tmp.push(node.id)
      for (const item of node.downstream || []) {
        downKeys.push(item)
      }
    }
    response[layer] = tmp
    layer += 1
    if (downKeys.length) {
      loop(downKeys)
    }
  }

  loop([data[0].id])

  let idx = response.length - 2
  while (idx >= 0) {
    let cIdx = 0
    const currentRow = response[idx]
    while (cIdx < currentRow.length) {
      const node = nodes[currentRow[cIdx]]
      if (node.downstream) {
        const downRow = response[idx + 1]
        for (const sKey of node.downstream) {
          let dIdx = downRow.indexOf(sKey)
          while (dIdx < cIdx) {
            let tIdx = idx + 1
            while (tIdx < response.length) {
              response[tIdx].splice(dIdx, 0, '  ')
              tIdx += 1
            }
            dIdx += 1
          }
          if (dIdx === cIdx) continue;
          while (dIdx > cIdx + 1) {
            const flag = [' 7', '-7'].includes(currentRow[cIdx]) ? '--' : ' -'
            cIdx += 1
            currentRow.splice(cIdx, 0, flag)
          }
          if ([' 7', '-7'].includes(currentRow[cIdx])) {
            currentRow.splice(cIdx + 1, 0, '-7')
          } else {
            currentRow.splice(cIdx + 1, 0, ' 7')
          }
          cIdx += 1
        }
      }
      cIdx += 1
    }
    idx -= 1
  }

  for (const row of response) {
    for (const idx in row) {
      const key = row[idx]
      row[idx] = nodes[key] || key
    }
  }

  idx = 1
  while (idx < response.length) {
    const nRow = []
    for (const item of response[idx]) {
      if (item.id) {
        nRow.push(' |')
      } else {
        nRow.push('  ')
      }
    }
    response.splice(idx, 0, nRow)
    idx += 2
  }

  return lds.cloneDeep(response)
}