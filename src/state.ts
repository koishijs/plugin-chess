import { SVG } from 'koishi-image-utils'
import { Meta } from 'koishi-core'

const numbers = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
const alphabet = 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ'

export enum MoveResult {
  p1Win = -1,
  p2Win = 1,
  draw = -2,
  skip = 2,
  illegal = 3,
}

export class State {
  p1: number
  p2: number
  next: number
  bBoard = 0n
  wBoard = 0n
  history: bigint[] = []
  readonly area: bigint
  readonly full: bigint
  imageMode = true
  update: (x: number, y: number, value: 1 | -1) => MoveResult

  constructor (public size: number, public placement: 'cross' | 'grid') {
    this.area = BigInt(size * size)
    this.full = (1n << this.area) - 1n
  }

  get pBoard () {
    return this.next === this.p2 ? this.wBoard : this.bBoard
  }

  set pBoard (value) {
    this.next === this.p2 ? this.wBoard = value : this.bBoard = value
  }

  get nBoard () {
    return this.next === this.p2 ? this.bBoard : this.wBoard
  }

  set nBoard (value) {
    this.next === this.p2 ? this.bBoard = value : this.wBoard = value
  }

  get isFull () {
    return !((this.bBoard | this.wBoard) ^ this.full)
  }

  bit (x: number, y: number) {
    return 1n << BigInt(x * this.size + y)
  }

  inRange (x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size
  }

  get (x: number, y: number): 0 | 1 | -1 {
    if (!this.inRange(x, y)) return 0
    const p = 1n << BigInt(x * this.size + y)
    if (p & this.bBoard) return 1
    if (p & this.wBoard) return -1
    return 0
  }

  drawSvg (x?: number, y?: number) {
    const { size, placement } = this
    const viewSize = size + (placement === 'cross' ? 2 : 3)
    const svg = new SVG({ viewSize, size: Math.max(512, viewSize * 32) }).fill('white')

    const lineGroup = svg.g({
      stroke: 'black',
      strokeWidth: 0.08,
      strokeLinecap: 'round',
    })
  
    const textGroup = svg.g({
      fontSize: '0.75',
      fontWeight: 'normal',
      style: 'letter-spacing: -0.1',
    })

    const topTextGroup = textGroup.g({ textAnchor: 'middle' })
    const leftTextGroup = textGroup.g({ textAnchor: 'right' })
    const maskGroup = svg.g({ fill: 'white' })
    const blackGroup = svg.g({ fill: 'black' })
    const whiteGroup = svg.g({
      fill: 'white',
      stroke: 'black',
      strokeWidth: 0.08,
    })
  
    const verticalOffset = placement === 'cross' ? 0.3 : 0.8
    const horizontalOffset = placement === 'cross' ? 0 : 0.5
    for (let index = 2; index < viewSize; ++ index) {
      lineGroup.line(index, 2, index, viewSize - 1)
      lineGroup.line(2, index, viewSize - 1, index)
      if (index < size + 2) {
        topTextGroup.text(String(index - 1), index + horizontalOffset, 1.3)
        leftTextGroup.text(String.fromCharCode(index + 63), 0.8, index + verticalOffset)
      }
    }

    for (let i = 0; i < size; i += 1) {
      for (let j = 0; j < size; j += 1) {
        const value = this.get(i, j)
        if (!value) {
          if (size >= 13 && size % 2 === 1
            && (i === 3 || i === size - 4 || i * 2 === size - 1)
            && (j === 3 || j === size - 4 || j * 2 === size - 1)) {
            lineGroup.circle(j + 2, i + 2, 0.08)
          }
          continue
        }
        let offset = 2.5
        if (placement === 'cross') {
          maskGroup.rect(j + 1.48, i + 1.48, j + 2.52, i + 2.52)
          offset = 2
        }
        const whiteMark = 0.08
        const blackMark = 0.12
        const cx = j + offset
        const cy = i + offset
        if (value === 1) {
          blackGroup.circle(cx, cy, 0.36)
          if (x === i && y === j) {
            blackGroup.rect(cx - blackMark, cy - blackMark, cx + blackMark, cy + blackMark, { fill: 'white' })
          }
        } else {
          whiteGroup.circle(cx, cy, 0.32)
          if (x === i && y === j) {
            whiteGroup.rect(cx - whiteMark, cy - whiteMark, cx + whiteMark, cy + whiteMark, { fill: 'black' })
          }
        }
      }
    }

    return svg
  }

  drawImage (x?: number, y?: number) {
    return this.drawSvg(x, y).toCQCode()
  }

  drawText (x?: number, y?: number) {
    const max = this.size - 1
    let output = '　' + numbers.slice(0, this.size)
    for (let i = 0; i < this.size; i += 1) {
      output += '\n' + alphabet[i]
      for (let j = 0; j < this.size; j += 1) {
        const value = this.get(i, j)
        output += value === 1 ? x === i && y === j ? '▲' : '●'
          : value === -1 ? x === i && y === j ? '△' : '○'
          : i === 0 ? j === 0 ? '┌' : j === max ? '┐' : '┬'
          : i === max ? j === 0 ? '└' : j === max ? '┘' : '┴'
          : j === 0 ? '├' : j === max ? '┤' : '┼'
      }
    }
    return output
  }

  async draw (meta: Meta, message: string, x?: number, y?: number) {
    if (this.imageMode) {
      const image = await this.drawImage(x, y)
      await meta.$send(message)
      await meta.$send(image)
    } else {
      await meta.$send(`${message}\n${this.drawText(x, y)}`)
    }
  }

  set (x: number, y: number, value: 0 | 1 | -1) {
    const chess = this.bit(x, y)
    let board = 0n
    if (value === 1) {
      this.wBoard &= ~chess
      board = this.bBoard |= chess
    } else if (value === -1) {
      this.bBoard &= ~chess
      board = this.wBoard |= chess
    } else {
      this.wBoard &= ~chess
      this.bBoard &= ~chess
    }
    this.save()
    return board
  }

  save () {
    this.history.push((this.wBoard << this.area) + this.bBoard)
  }
}
