import { Context, Meta } from 'koishi-core'
import { isInteger } from 'koishi-utils'
import { State, MoveResult } from './state'
import * as go from './go'
import * as gomoku from './gomoku'
import * as othello from './othello'

interface Rule {
  placement?: 'grid' | 'cross'
  create?: (this: State) => string | void
  update?: (this: State, x: number, y: number, value: -1 | 1) => MoveResult
}

const rules: Record<string, Rule> = {
  go,
  gomoku,
  othello,
}

const states: Record<number, State> = {}

function getSenderName (meta: Meta) {
  return meta.sender.card || meta.sender.nickname
}

export * from './state'

export const name = 'chess'

export function apply (ctx: Context) {
  ctx = ctx.intersect(ctx.app.groups)

  ctx.command('chess [position]', '棋类游戏')
    .shortcut('落子', { fuzzy: true })
    .shortcut('悔棋', { options: { repent: true } })
    .shortcut('围棋', { options: { size: 19, rule: 'go' }, fuzzy: true })
    .shortcut('五子棋', { options: { size: 15, rule: 'gomoku' }, fuzzy: true })
    .shortcut('奥赛罗', { options: { size: 8, rule: 'othello' }, fuzzy: true })
    .shortcut('黑白棋', { options: { size: 8, rule: 'othello' }, fuzzy: true })
    .shortcut('停止下棋', { options: { stop: true }})
    .shortcut('跳过回合', { options: { skip: true }})
    .shortcut('使用图片模式', { options: { imageMode: true } })
    .shortcut('使用文本模式', { options: { textMode: true } })
    .option('-i, --image-mode', '使用图片模式')
    .option('-t, --text-mode', '使用文本模式')
    .option('--rule <rule>', '设置规则，支持的规则有 go, gomoku, othello')
    .option('--size <size>', '设置大小')
    .option('--skip', '跳过回合')
    .option('--repent', '悔棋')
    .option('--stop', '停止游戏')
    .usage([
      '输入“五子棋”“黑白棋”“围棋”开始对应的一局游戏。',
      '再输入“落子 A1”将棋子落于 A1 点上。',
      '目前默认使用图片模式。文本模式速度更快，但是在部分机型上可能无法正常显示，同时无法适应过大的棋盘。'
    ].join('\n'))
    .action(async ({ meta, options }, position) => {
      if (!states[meta.groupId]) {
        if (position || options.stop || options.repent || options.skip) {
          return meta.$send('没有正在进行的游戏。输入“下棋”开始一轮游戏。')
        }

        if (!isInteger(options.size) || options.size < 2 || options.size > 20) {
          return meta.$send('棋盘大小应该为不小于 2，不大于 20 的整数。')
        }

        const rule = rules[options.rule]
        if (!rule) return meta.$send('没有找到对应的规则。')

        const state = new State(options.size, rule.placement || 'cross')
        state.p1 = meta.userId

        if (options.textMode) state.imageMode = false

        if (rule.create) {
          const result = rule.create.call(state)
          if (result) return meta.$send(result)
        }
        state.update = rule.update
        states[meta.groupId] = state

        return state.draw(meta, `${getSenderName(meta)} 发起了游戏！`)
      }

      if (options.stop) {
        delete states[meta.groupId]
        return meta.$send('游戏已停止。')
      }

      const state = states[meta.groupId]

      if (options.textMode) {
        state.imageMode = false
        return state.draw(meta, '已切换到文本模式。')
      } else if (options.imageMode) {
        state.imageMode = true
        return state.draw(meta, '已切换到图片模式。')
      }

      if (state.p2 && state.p1 !== meta.userId && state.p2 !== meta.userId) {
        return meta.$send('游戏已经开始，无法加入。')
      }

      if (options.skip) {
        if (state.next !== meta.userId) return meta.$send('当前不是你的回合。')
        state.next = state.p1 === meta.userId ? state.p2 : state.p1
        return meta.$send(`${getSenderName(meta)} 选择跳过其回合，下一手轮到 [CQ:at,qq=${state.next}]。`)
      }

      if (options.repent) {
        if (!state.p2) return meta.$send('尚未有人行棋。')
        const last = state.p1 === state.next ? state.p2 : state.p1
        if (last !== meta.userId) return meta.$send('上一手棋不是你所下。')
        const board = state.history.pop()
        state.wBoard = board >> state.area
        state.bBoard = board & state.full
        state.next = last
        return state.draw(meta, `${getSenderName(meta)} 进行了悔棋。`)
      }

      if (!position) return meta.$send('请输入坐标。')

      if (typeof position !== 'string' || !/^[a-z]\d+$/i.test(position)) {
        return meta.$send('请输入由字母+数字构成的坐标。')
      }

      if (!state.p2) {
        if (meta.userId === state.p1) return meta.$send('当前不是你的回合。')
      } else {
        if (meta.userId !== state.next) return meta.$send('当前不是你的回合。')
      }

      const x = position.charCodeAt(0) % 32 - 1
      const y = parseInt(position.slice(1)) - 1
      if (x >= state.size || y >= state.size || y < 0) {
        return meta.$send('落子超出边界。')
      }

      if (state.get(x, y)) return meta.$send('此处已有落子。')

      let message = ''
      if (!state.p2) {
        state.p2 = meta.userId
        message = `${getSenderName(meta)} 加入了游戏并落子于 ${position.toUpperCase()}，`
      } else {
        message = `${getSenderName(meta)} 落子于 ${position.toUpperCase()}，`
      }

      const value = meta.userId === state.p1 ? -1 : 1
      const result = state.update.call(state, x, y, value) as MoveResult

      switch (result) {
        case MoveResult.illegal:
          state.next = meta.userId
          return meta.$send('非法落子。')
        case MoveResult.skip:
          message += `下一手依然轮到 [CQ:at,qq=${meta.userId}]。`
          break
        case MoveResult.p1Win:
          message += `恭喜 [CQ:at,qq=${state.p1}] 获胜！`
          delete states[meta.groupId]
          break
        case MoveResult.p2Win:
          message += `恭喜 [CQ:at,qq=${state.p2}] 获胜！`
          delete states[meta.groupId]
          break
        case MoveResult.draw:
          message += `本局游戏平局。`
          delete states[meta.groupId]
          break
        default:
          state.next = meta.userId === state.p1 ? state.p2 : state.p1
          message += `下一手轮到 [CQ:at,qq=${state.next}]。`
      }

      return state.draw(meta, message, x, y)
    })
}
