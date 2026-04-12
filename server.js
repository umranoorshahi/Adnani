require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI).then(()=>console.log("DB Connected"));

const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

let posts = [];

app.post('/api/posts', (req,res)=>{
  const post = { id: Date.now(), text: req.body.text, comments: [] };
  posts.unshift(post);
  io.emit('new_post', post);
  res.json({success:true});
});

app.get('/api/posts', (req,res)=>{
  res.json({posts});
});

app.post('/api/comment', (req,res)=>{
  const {postId,text} = req.body;
  const post = posts.find(p=>p.id==postId);
  post.comments.push({text});
  io.emit('new_comment');
  res.json({success:true});
});

io.on('connection',(socket)=>{
  socket.on('send_message',(msg)=>{
    io.emit('new_message',msg);
  });
});

server.listen(5000,()=>console.log("Server running"));
