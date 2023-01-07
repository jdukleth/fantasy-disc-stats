import 'dotenv/config'
import fs from 'fs'
import axios from 'axios'
import { parse } from 'node-html-parser'
import { format } from '@fast-csv/format'

const getPlayerStats = async (player) => {
  const url = `https://www.pdga.com/player/${player.pdgaNumber}/stats/2022`
  const { data } = await axios.get(url)
  const dom = parse(data)
  const memberStatus = getMemberStatus(dom)
  const playerInfo = [
    player.name,
    player.rating,
    player.pdgaNumber,
  ]

  if (memberStatus === 'Current') {
    const upcomingDgptEvents = getUpcomingDgptEvents(dom)
    const upcomingDgptEventsCount = upcomingDgptEvents.length
    const priorDgptEvents = getPriorDgptEvents(dom)
    const priorDgptEventsCount = priorDgptEvents.length
    const targetEventPlace = getTargetEventPlace(upcomingDgptEvents, priorDgptEvents)
    const averageDgptPriorPlacement = getAverageDgptPriorPlacement(priorDgptEvents, priorDgptEventsCount)
    const playerStats = [
      upcomingDgptEventsCount,
      priorDgptEventsCount,
      averageDgptPriorPlacement,
    ]

    // skip player if they aren't registered for the target event
    if (!targetEventPlace) return false

    return [
      ...playerInfo,
      ...playerStats,
      targetEventPlace
    ]
  }
}

const getMemberStatus = (dom) => {
  const status = dom.querySelector('.membership-status a').innerHTML

  return status
}

const getUpcomingDgptEvents = (dom) => {
  const upcomingEvents = dom.querySelector('.upcoming-events')
  const upcomingEventsHtml = upcomingEvents ? upcomingEvents.innerHTML : ''
  const eventRows = upcomingEventsHtml.match(/\<li(.*?)\/li\>/g) || []
  const upcomingDgptEvents = eventRows.filter((rowDom) => rowDom.match(/\>DGPT /g))

  return upcomingDgptEvents
}

const getPriorDgptEvents = (dom) => {
  const playerResults = dom.querySelector('#player-results-mpo')
  const playerResultsHtml = playerResults ? playerResults.innerHTML : ''
  const eventRows = playerResultsHtml.match(/\<tr.{0,}/g) || []
  const dgptEvents = eventRows.filter((rowDom) => rowDom.match(/\>DGPT /g))

  return dgptEvents
}

const getAverageDgptPriorPlacement = (dgptEvents, dgptPriorEventsCount) => {
  const sumOfDgptPriorPlacements = dgptEvents.reduce((acc, rowHtml) => {
    const rowDom = parse(rowHtml)
    const dgptPlacement = parseInt(rowDom.querySelector('.place').innerHTML)

    return acc + dgptPlacement
  }, 0)

  const averageDgptPriorPlacement = dgptPriorEventsCount
    ? Math.round(sumOfDgptPriorPlacements / dgptPriorEventsCount)
    : ''

  return averageDgptPriorPlacement
}

const getTargetEventPlace = (upcomingDgptEvents, priorDgptEvents) => {
  const targetEventName = process.env.SPECIFIC_EVENT_NAME
  if (!targetEventName) return 'n/a'

  const isAttending = upcomingDgptEvents.find((event) => event.includes(targetEventName))
  if (!isAttending) return false

  const eventPriorName = process.env.PRIOR_EVENT_NAME
  const priorEventMatch = priorDgptEvents.filter((event) => event.includes(eventPriorName))
  if (!priorEventMatch.length) return '-'
  const eventPriorPlaceDom = parse(priorEventMatch[0])
  const eventPriorPlace = parseInt(eventPriorPlaceDom.querySelector('.place').innerHTML)

  return eventPriorPlace
}

const run = async () => {
  const csvHeaders = ['PLAYER', 'RATING', 'PDGA #', '2023 EVENTS', '2022 EVENTS', '2022 AVG PLACE', '2022 TARGET PLACE']
  const stream = format({ headers: csvHeaders })
  const csvFile = await fs.createWriteStream(process.env.OUTPUT_FILE)
  const { default: players } = await import(`./${process.env.PLAYERS_FILE}`)
  stream.pipe(csvFile)

  for await (const player of players) {
    const playerRowData = await getPlayerStats(player)

    if (playerRowData) {
      console.log(playerRowData)
      stream.write(playerRowData)
    }
  }

  stream.end()
  console.log('DONE! player-data.csv was generated')
}

run()
