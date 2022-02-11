import axios from 'axios'
import { parse } from 'node-html-parser'
import { format } from '@fast-csv/format'
import fs from 'fs'
import players from './players.js'

const getPlayerStats = async (player) => {
  let playerRowData = [player.name, player.rating]

  const url = `https://www.pdga.com/player/${player.pdgaNumber}/stats/2021`
  const { data } = await axios.get(url)
  const dom = parse(data)
  const memberStatus = getMemberStatus(dom)

  if (memberStatus === 'Current') {
    const upcomingDgptEventsCount = getUpcomingDgptEventsCount(dom)
    const priorDgptEvents = getPriorDgptEvents(dom)
    const priorDgptEventsCount = getPriorDgptEventsCount(priorDgptEvents)
    const averageDgptPriorPlacement = getAverageDgptPriorPlacement(priorDgptEvents, priorDgptEventsCount)

    playerRowData = [
      ...playerRowData,
      upcomingDgptEventsCount,
      priorDgptEventsCount,
      averageDgptPriorPlacement
    ]
  } else {
    playerRowData = [...playerRowData, 'EXPIRED', 'EXPIRED', 'EXPIRED']
  }

  return [...playerRowData, player.pdgaNumber]
}

const getMemberStatus = (dom) => {
  const status = dom.querySelector('.membership-status a').innerHTML

  return status
}

const getUpcomingDgptEventsCount = (dom) => {
  const upcomingEvents = dom.querySelector('.upcoming-events')
  const upcomingEventsHtml = upcomingEvents ? upcomingEvents.innerHTML : ''
  const upcomingDgptCount = (upcomingEventsHtml.match(/\>DGPT /g) || []).length

  return upcomingDgptCount
}

const getPriorDgptEvents = (dom) => {
  const playerResults = dom.querySelector('#player-results-mpo')
  const playerResultsHtml = playerResults ? playerResults.innerHTML : ''
  const eventRows = playerResultsHtml.match(/\<tr.{0,}/g) || []
  const dgptEvents = eventRows.filter((rowDom) => {
    return rowDom.match(/\>DGPT /g)
  })

  return dgptEvents
}

const getPriorDgptEventsCount = (dgptEvents) => {
  const priorDgptEventsCount = dgptEvents.length

  return priorDgptEventsCount
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

const run = async () => {
  const csvHeaders = ['PLAYER', 'RATING', '2022 EVENTS', '2021 EVENTS', '2021 AVG PLACE', 'PDGA #']
  const stream = format({ headers: csvHeaders })
  const csvFile = fs.createWriteStream('player-data.csv')
  stream.pipe(csvFile)
  let csvRows = []

  for await (const player of players) {
    const playerRowData = await getPlayerStats(player)
    csvRows.push(playerRowData)
    console.log(playerRowData)
    stream.write(playerRowData)
  }

  stream.end()
  console.log('DONE! player-data.csv was generated')
}

run()