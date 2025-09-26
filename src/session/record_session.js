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
    if (!this.isPaused) {
      this.outBytes += buffer.length;
      this.fileStream.write(buffer);
    }
  };

  /**
   * 暂停录制
   */
  pause() {
    if (this.isPaused) {
      throw new Error("Record session is already paused");
    }
    this.isPaused = true;
    logger.info(`Record session ${this.id} ${this.streamPath} paused`);
  }

  /**
   * 恢复录制
   */
  resume() {
    if (!this.isPaused) {
      throw new Error("Record session is not paused");
    }
    this.isPaused = false;
    logger.info(`Record session ${this.id} ${this.streamPath} resumed`);
  }

  /**
   * 停止录制
   */
  stop() {
    this.fileStream.close();
    this.broadcast.donePlay(this);
    logger.info(`Record session ${this.id} ${this.streamPath} stopped`);
    Context.eventEmitter.emit("doneRecord", this);
  }
};

module.exports = NodeRecordSession;
