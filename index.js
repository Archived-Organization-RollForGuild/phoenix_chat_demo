#!/usr/bin/env node
'use strict'

const { Socket, Presence } = require('phoenix-channels')
const { inputBar, messageView, topicBar, screen, typingBar } = require('./interface')

const program = require('commander')
const chalk = require('chalk')

let url = null
let token = null
let typingTimer = null
let isTyping = false

/*
* for the sake of this primitive demo application you can only chat in one channel at a time
* whatever conversation you joined last. The proper application should of course track all conversations
* in a better way
* */
let activeChannel = null
let channelMembers = {}

/**
 * Sends message when the user hits enter, primitive support for /commands like /quit and /new
 */
inputBar.on('submit', (text) => {
  inputBar.clearValue()
  if (text.startsWith('/')) {
    onCommand(text.substring(1))
    return
  }

  activeChannel.push('messages:create', {
    data: {
      type: 'messages',
      attributes: {
        body: text
      }
    }
  })
})

/**
 * Updates typing status when the user presses a key
 */
inputBar.on('keypress', (ch, key) => {
  screen.render()
  if (!isTyping) {
    isTyping = true
    activeChannel.push('messages:typing', {
      data: {
        type: 'typing',
        attributes: {
          value: true
        }
      }
    })
  }

  /**
   * When the user is typing we active a 2 second timer, as they continue typing we destroy the timer and
   * set a new one for each key stroke, when the user stops typing the timer will finish 2 seconds later
   * and send the stopped typing signal
   * */
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => {
    isTyping = false
    activeChannel.push('messages:typing', {
      data: {
        type: 'typing',
        attributes: {
          value: false
        }
      }
    })
  }, 2000)
})

let presences = {}

program
  .version('1.0')
  .arguments('<url> <token>')
  .action((_url,  _token) => {
    url = _url
    token = _token
  })

program.parse(process.argv)
if (!url || !token) {
  messageView.insertBottom([chalk.bold.bgRed.whiteBright('Missing required arguments')])
  screen.render()
  process.exit(1)
}

let socket = new Socket(url, {params: {userToken: token}})
messageView.insertBottom([chalk.bold.bgWhiteBright.black(`Connecting to ${url}`)])
screen.render()

socket.onError(() => {
  messageView.insertBottom([chalk.bold.bgRed.whiteBright('The connection closed due to an error')])
  screen.render()
  process.exit(1)
})
socket.onClose(() => {
  messageView.insertBottom([chalk.bold.bgRed.whiteBright('Connection closed')])
  screen.render()
})

socket.connect()
messageView.insertBottom([chalk.bold.bgGreen.whiteBright('Connection established')])
messageView.insertBottom([''])
screen.render()

/*
* Join the index channel. This is done immedately upon websocket connection and provides us with a list of
* all message threads we are in
* */
let message_threads = socket.channel("message_threads:index", {})
message_threads.onClose(() => {
  messageView.insertBottom([chalk.bold.bgRed.whiteBright('Channel closed')])
  screen.render()
})
message_threads.onError(() => {
  messageView.insertBottom([chalk.bold.bgRed.whiteBright('Channel error')])
  screen.render()
})

message_threads.join()
  .receive("ok", joinConversations)
  .receive("error", ({reason}) => {
    messageView.insertBottom([chalk.bold.bgRed.whiteBright('Failed to join connection management channel')])
    screen.render()
  })
  .receive("timeout", () => {
    messageView.insertBottom([chalk.bold.bgRed.whiteBright('Connection timeout')])
    screen.render()
  })

/**
 * primitive IRC like /command handling */
function onCommand (input) {
  let [command, ...args] = input.split(' ')
  switch (command) {
    case 'quit':
      process.exit(1)
      break

    case 'new':
      /* Create a new conversation thread */
      let participants = args.map((participant) => {
        return {
          type: 'message-participants',
          id: participant
        }
      })
      message_threads.push('message_threads:create', {
        data: {
          type: 'message-threads',
          attributes: {
            message_participants: participants
          }
        }
      }).receive("ok", (response) => {
        /*
        * The API can't really force us to listen to a channel, when we have created a conversation we must
        * join the thread we receive in response ourself.
        * */
        join(response)
      })
      break
  }
}

/**
 * Parses the response we receive upon joining the index channel and joins all the conversations we are part of
 * */
function joinConversations (response) {
  for (let conversation of response.data) {
    join(conversation)
  }
}

/**
 * Join a conversation
 * @param conversation message thread returned from the API
 */
function join (conversation) {
  let channel = socket.channel(`message_threads:${conversation.id}`)

  /**
   * The API has sent us an initial set of presence data
   * */
  channel.on('presence_state', state => {
    presences = Presence.syncState(presences, state)
    updateTypingStatus(presences)
  })

  /**
   * There has been updates to presence data
   * */
  channel.on('presence_diff', diff => {
    presences = Presence.syncDiff(presences, diff)
    updateTypingStatus(presences)
  })

  /**
   * Someone has sent a new message
   * */
  channel.on("messages:new", msg => {
    let username = channelMembers[msg.data.relationships.users.id].username
    let date = new Date(msg.data.attributes.inserted_at)
    let timestamp = date.toTimeString().split(' ')[0]

    messageView.insertBottom(`${timestamp} {bold}<${username}>{/bold} ${msg.data.attributes.body}`)
    screen.render()
  })

  channel.join()
    .receive("ok", (channelInfo) => {
      activeChannel = channel

      /**
       * Example of retreiving all conversation members and the conversation title from the data
       * we receive upon joining a channel
       * */
      let conversationMembers = channelInfo.included.map(m => m.attributes.username).join(', ')
      for (let conversationMember of channelInfo.included) {
        channelMembers[conversationMember.id] = conversationMember.attributes
      }

      topicBar.setLine(0, `In a conversation with: ${conversationMembers}`)
      topicBar.setLine(1, `Title: ${conversation.attributes.title}`)
      screen.render()
    })
    .receive("error", (error) => {
      messageView.insertBottom([chalk.bold.bgRed.whiteBright('Failed to join conversation')])
      screen.render()
    })
}

/**
 * Example implementation of generating typing status from a list of presences in the conversation
 * @param presences
 */
function updateTypingStatus (presences) {
  screen.render()
  let typingUserIds = Object.keys(presences).filter(presenceKey => {
    let presence = presences[presenceKey]
    return presence.metas.some(meta => meta.typing)
  })

  if (typingUserIds.length > 0) {
    let typingUsernames = typingUserIds.map(typingId => {
      return channelMembers[typingId].username
    })
    typingBar.setLine(0, `${typingUsernames.join(', ')} is typing..`)
    screen.render()
  } else {
    typingBar.setLine(0, '')
    screen.render()
  }
}
