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
    this.startTime = 0;
    this.hasVideoKeyFrame = false;
    this.firstVideoTimestamp = 0;
    this.firstAudioTimestamp = 0;
    this.hasAudio = false;
    this.hasVideo = false;
    this.duration = 0;
    this.fileOffset = 0;
    this.metaDataPosition = 0;
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
    // 注册会话到全局 Context
    Context.sessions.set(this.id, this);
    
    this.broadcast.postPlay(this);
    logger.info(`Record session ${this.id} ${this.streamPath} start record ${this.filePath}`);
    Context.eventEmitter.emit("postRecord", this);
    Context.eventEmitter.on("donePublish", (session) => {
      if (session.streamPath === this.streamPath) {
        this.fileStream.close();
        this.broadcast.donePlay(this);
        Context.sessions.delete(this.id); // 清理会话
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
      
      // 处理视频或音频标签
      if (tagType === 8 || tagType === 9) {
        // 读取时间戳 (24位)
        let timestamp = buffer.readUIntBE(4, 3);
        let originalTimestamp = timestamp;

        // 标记音视频流存在
        if (tagType === 8) this.hasAudio = true;
        if (tagType === 9) this.hasVideo = true;

        // 处理视频关键帧
        if (tagType === 9 && !this.hasVideoKeyFrame) {
          // 检查是否是关键帧 (读取 VIDEODATA 的 frametype，1=keyframe)
          const frameType = (buffer[11] & 0xF0) >> 4;
          if (frameType === 1) {
            this.hasVideoKeyFrame = true;
            this.firstVideoTimestamp = timestamp;
            this.startTime = this.firstVideoTimestamp;
          }
        }
        
        // 记录第一个音频时间戳
        if (tagType === 8 && this.firstAudioTimestamp === 0) {
          this.firstAudioTimestamp = timestamp;
          if (!this.hasVideoKeyFrame) {
            this.startTime = this.firstAudioTimestamp;
          }
        }

        // 调整时间戳
        if (this.startTime > 0) {
          // 减去开始时间和暂停时间
          timestamp = timestamp - this.startTime - this.totalPausedTime;
          if (timestamp < 0) timestamp = 0;

          // 写回调整后的时间戳 (24位)
          buffer.writeUIntBE(timestamp, 4, 3);
          
          // 同步扩展时间戳 (8位)
          buffer[7] = (timestamp >> 24) & 0xFF;

          // 更新持续时间
          this.duration = Math.max(this.duration, timestamp);
        }

        // 更新最后的时间戳
        if (tagType === 9) {
          this.lastVideoTimestamp = originalTimestamp;
        } else {
          this.lastAudioTimestamp = originalTimestamp;
        }
      } else if (tagType === 18) { // Script Data Tag (onMetaData)
        // 记录 metadata 位置，以便后续更新
        this.metaDataPosition = this.fileOffset;
      }
    }

    this.outBytes += buffer.length;
    this.fileOffset += buffer.length;
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
  async stop() {
    // 关闭文件流
    this.fileStream.end();
    // 从订阅者列表中移除此录制会话
    this.broadcast.subscribers.delete(this.id);
    // 从全局 Context 中移除会话
    Context.sessions.delete(this.id);
    
    logger.info(`Record session ${this.id} ${this.streamPath} stopped, duration: ${this.duration/1000}s`);
    // 发送录制完成事件
    Context.eventEmitter.emit("doneRecord", this);
  }
};

module.exports = NodeRecordSession;
