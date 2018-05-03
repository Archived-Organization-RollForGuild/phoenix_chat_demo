'use strict'

const blessed = require('blessed')

let screen = blessed.screen({
  smartCSR: true
})
screen.title = 'Phoenix Client'

let topicBar = blessed.box({
  top: 0,
  left: 0,
  width: screen.width,
  height:  2,
  tags: true,
  style: {
    fg: '#000000',
    bg: '#f0f0f0',
  }
})

let typingBar = blessed.box({
  bottom: 0,
  left: 0,
  width: screen.width,
  height:  1,
  tags: true,
  style: {
    fg: '#000000',
    bg: '#f0f0f0',
  }
})


let messageView = blessed.box({
  top: 2,
  left: 0,
  width: screen.width,
  height: screen.height - 2,
  tags: true,
  scrollable: true
})

let inputBar = blessed.textbox({
  bottom: 1,
  left: 0,
  height: 1,
  width: '100%',
  keys: true,
  mouse: true,
  inputOnFocus: true,
  style: {
    fg: 'white',
    bg: 'blue'
  }
})

screen.append(messageView)
screen.append(topicBar)
screen.append(typingBar)
screen.append(inputBar)

screen.render()
inputBar.focus()

screen.key('enter', (ch, key) => {
  inputBar.focus();
})


module.exports = {
  screen,
  topicBar,
  typingBar,
  messageView,
  inputBar
}
