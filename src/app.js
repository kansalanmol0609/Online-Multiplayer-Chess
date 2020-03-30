const path = require('path')
const http = require('http')
const express = require('express')
const socketio = require('socket.io')

var Chess = require('chess.js').Chess;

const app = express()
const server = http.createServer(app)
const io = socketio(server)

const port = process.env.PORT || 3000
const publicDirectoryPath = path.join(__dirname, '../public')

app.use(express.static(publicDirectoryPath))

// const Data = new Map()
const gameData = new Map()
const userData = new Map()
const roomsList = new Set()

let totalUsers = 0;

//Getting a connection
io.on('connection', (socket) => {
    totalUsers++;
    // console.log(totalUsers)
    //To render rooms list initially
    io.emit('roomsList', Array.from(roomsList));
    io.emit('updateTotalUsers', totalUsers)
    const updateStatus = (game, room) => {
        // checkmate?
        if (game.in_checkmate()) {
            io.to(room).emit('gameOver', game.turn(), true)
        }
        // draw? 
        else if (game.in_draw()) {
            io.to(room).emit('gameOver', game.turn(), false)
        }
        // game still on
        else {
            if (game.in_check()) {
                io.to(room).emit('inCheck', game.turn())
            }
            else {
                io.to(room).emit('updateStatus', game.turn())
            }
        }
    }

    //Creating and joining the room
    socket.on('joinRoom', ({ user, room }, callback) => {
        //We have to limit the number of users in a room to be just 2
        if (io.nsps['/'].adapter.rooms[room] && io.nsps['/'].adapter.rooms[room].length === 2) {
            return callback('Already 2 users are there in the room!')
        }

        var alreadyPresent = false
        for (var x in userData) {
            if (userData[x].user == user && userData[x].room == room) {
                alreadyPresent = true
            }
        }
        // console.log(userData);
        //If same name user already present
        if (alreadyPresent) {
            return callback('Choose different name!')
        }

        socket.join(room)
        //Rooms List Update
        roomsList.add(room);
        io.emit('roomsList', Array.from(roomsList));
        totalRooms = roomsList.length
        io.emit('totalRooms', totalRooms)
        userData[user + "" + socket.id] = {
            room, user,
            id: socket.id
        }

        //If two users are in the same room, we can start
        if (io.nsps['/'].adapter.rooms[room].length === 2) {
            //Rooms List Delete
            roomsList.delete(room);
            io.emit('roomsList', Array.from(roomsList));
            totalRooms = roomsList.length
            io.emit('totalRooms', totalRooms)
            var game = new Chess()
            //For getting ids of the clients
            for (var x in io.nsps['/'].adapter.rooms[room].sockets) {
                gameData[x] = game
            }
            //For giving turns one by one
            io.to(room).emit('Dragging', socket.id)
            io.to(room).emit('DisplayBoard', game.fen(), socket.id, game.pgn())
            updateStatus(game, room)
        }
    })

    //For catching dropped event
    socket.on('Dropped', ({ source, target, room }) => {
        var game = gameData[socket.id]
        var move = game.move({
            from: source,
            to: target,
            promotion: 'q' // NOTE: always promote to a queen for example simplicity
        })
        // If correct move, then toggle the turns
        if (move != null) {
            io.to(room).emit('Dragging', socket.id)
        }
        io.to(room).emit('DisplayBoard', game.fen(), undefined, game.pgn())
        updateStatus(game, room)
        // io.to(room).emit('printing', game.fen())
    })

    //Catching message event
    socket.on('sendMessage', ({ user, room, message }) => {
        io.to(room).emit('receiveMessage', user, message)
    })

    //Disconnected
    socket.on('disconnect', () => {
        totalUsers--;
        io.emit('updateTotalUsers', totalUsers)
        var room = '', user = '';
        for (var x in userData) {
            if (userData[x].id == socket.id) {
                room = userData[x].room
                user = userData[x].user
                delete userData[x]
            }
        }
        //Rooms Removed
        if (userData[room] == null) {
            //Rooms List Delete
            roomsList.delete(room);
            io.emit('roomsList', Array.from(roomsList));
            totalRooms = roomsList.length
            io.emit('totalRooms', totalRooms)
        }
        gameData.delete(socket.id)
        if (user != '' && room != '') {
            io.to(room).emit('disconnectedStatus');
        }
    })
})

server.listen(port, () => {
    console.log(`Server is up on port ${port}!`)
})