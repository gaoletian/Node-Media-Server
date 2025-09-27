// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 Nodemedia. All rights reserved.
//

const fs = require("node:fs");
const path = require("node:path");
const logger = require("../core/logger.js");
const BaseSession = require("./base_session");
const BroadcastServer = require("../server/broadcast_server.js");
const Context = require("../core/context.js");

/**
 * @class
 * @augments BaseSession
 */
class NodeRecordSession extends BaseSession {

  /**
   * 
   * @param {BaseSession} session 
   * @param {string} filePath
   */
  constructor(session, filePath) {
    super();
    this.protocol = "flv";
    this.streamApp = session.streamApp;
    this.streamName = session.streamName;
    this.streamPath = session.streamPath;
    this.filePath = filePath;
    this.fileStream = this.createWriteStreamWithDirsSync(filePath);
    this.isPaused = false;
    this.pauseStartTime = 0;
    this.totalPausedTime = 0;
    this.lastVideoTimestamp = 0;
    this.lastAudioTimestamp = 0;
    /**@type {BroadcastServer} */
    this.broadcast = Context.broadcasts.get(this.streamPath) ?? new BroadcastServer();
    Context.broadcasts.set(this.streamPath, this.broadcast);
  }

  /**
   * 
   * @param {string} filePath 
   * @returns {fs.WriteStream}
   */
  createWriteStreamWithDirsSync(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    return fs.createWriteStream(filePath);
  }

  run() {
    this.broadcast.postPlay(this);
    logger.info(`Record session ${this.id} ${this.streamPath} start record ${this.filePath}`);
    Context.eventEmitter.emit("postRecord", this);
    Context.eventEmitter.on("donePublish", (session) => {
      if (session.streamPath === this.streamPath) {
        this.fileStream.close();
        this.broadcast.donePlay(this);
        logger.info(`Record session ${this.id} ${this.streamPath} done record ${this.filePath}`);
        Context.eventEmitter.emit("doneRecord", this);
      }
    });
  }

  /**
   * @override
   * @param {Buffer} buffer
   */
  sendBuffer = (buffer) => {
    if (this.isPaused) {
      return;
    }

    // 检测包类型和时间戳
    if (buffer.length > 11) {  // FLV tag header size
      const tagType = buffer[0];  // 8:audio, 9:video, 18:script
      if (tagType === 8 || tagType === 9) {
        // 读取时间戳 (24位)
        let timestamp = buffer.readUIntBE(4, 3);
        
        // 调整时间戳以补偿暂停时间
        if (this.totalPausedTime > 0) {
          timestamp -= this.totalPausedTime;
          // 写回调整后的时间戳
          buffer.writeUIntBE(timestamp, 4, 3);
          
          // 同步扩展时间戳 (8位)
          buffer[7] = (timestamp >> 24) & 0xFF;
        }

        // 更新最后的时间戳
        if (tagType === 9) {
          this.lastVideoTimestamp = timestamp;
        } else {
          this.lastAudioTimestamp = timestamp;
        }
      }
    }

    this.outBytes += buffer.length;
    this.fileStream.write(buffer);
  };

  /**
   * 暂停录制
   */
  pause() {
    if (this.isPaused) {
      throw new Error("Record session is already paused");
    }
    this.isPaused = true;
    this.pauseStartTime = Date.now();
    logger.info(`Record session ${this.id} ${this.streamPath} paused`);
  }

  /**
   * 恢复录制
   */
  resume() {
    if (!this.isPaused) {
      throw new Error("Record session is not paused");
    }
    
    // 计算本次暂停的时间（毫秒）
    const pauseDuration = Date.now() - this.pauseStartTime;
    this.totalPausedTime += Math.floor(pauseDuration);
    
    this.isPaused = false;
    this.pauseStartTime = 0;
    logger.info(`Record session ${this.id} ${this.streamPath} resumed, pause duration: ${pauseDuration}ms, total paused: ${this.totalPausedTime}ms`);
  }

  /**
   * 停止录制
   */
  stop() {
    // 关闭文件流
    this.fileStream.end();
    // 从订阅者列表中移除此录制会话
    this.broadcast.subscribers.delete(this.id);
    logger.info(`Record session ${this.id} ${this.streamPath} stopped`);
    // 发送录制完成事件
    Context.eventEmitter.emit("doneRecord", this);
  }
};

module.exports = NodeRecordSession;
