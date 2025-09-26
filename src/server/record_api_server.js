// @ts-check
//
//  Created by Chen Mingliang on 25/09/26.
//  illuspas@msn.com
//  Copyright (c) 2025 Nodemedia. All rights reserved.
//

const express = require("express");
const logger = require("../core/logger.js");
const Context = require("../core/context.js");
const NodeRecordSession = require("../session/record_session.js");
const path = require("path");

/**
 * @typedef {import("express").Request} Request
 * @typedef {import("express").Response} Response
 */

class NodeRecordApiServer {
  /**
   * @param {any} config
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * @param {any} app
   */
  attachToApp(app) {
    if (!this.config.record?.path) {
      return;
    }

    // 开始录制
    app.post("/api/record/start/:app/:name", /** @param {Request} req @param {Response} res */ (req, res) => {
      const streamPath = `/${req.params.app}/${req.params.name}`;
      const broadcast = Context.broadcasts.get(streamPath);
      
      if (!broadcast || !broadcast.publisher) {
        return res.status(404).json({ error: "Stream not found or not publishing" });
      }

      const filePath = path.join(this.config.record.path, streamPath, Date.now() + ".flv");
      const session = new NodeRecordSession(broadcast.publisher, filePath);
      
      try {
        session.run();
        res.json({ 
          success: true,
          sessionId: session.id,
          filePath: session.filePath
        });
      } catch (/** @type {Error} */ error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 暂停录制
    app.post("/api/record/pause/:sessionId", /** @param {Request} req @param {Response} res */ (req, res) => {
      const sessionId = req.params.sessionId;
      const session = Context.getSession(sessionId);
      
      if (!session || session.protocol !== "flv") {
        return res.status(404).json({ error: "Record session not found" });
      }

      try {
        session.pause();
        res.json({ success: true });
      } catch (/** @type {Error} */ error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 恢复录制
    app.post("/api/record/resume/:sessionId", /** @param {Request} req @param {Response} res */ (req, res) => {
      const sessionId = req.params.sessionId;
      const session = Context.getSession(sessionId);
      
      if (!session || session.protocol !== "flv") {
        return res.status(404).json({ error: "Record session not found" });
      }

      try {
        session.resume();
        res.json({ success: true });
      } catch (/** @type {Error} */ error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 停止录制
    app.post("/api/record/stop/:sessionId", /** @param {Request} req @param {Response} res */ (req, res) => {
      const sessionId = req.params.sessionId;
      const session = Context.getSession(sessionId);
      
      if (!session || session.protocol !== "flv") {
        return res.status(404).json({ error: "Record session not found" });
      }

      try {
        session.stop();
        res.json({ success: true });
      } catch (/** @type {Error} */ error) {
        res.status(500).json({ error: error.message });
      }
    });
  }
}

module.exports = NodeRecordApiServer;