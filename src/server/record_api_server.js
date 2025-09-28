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

    // 在每个响应中添加CORS头
    const addCorsHeaders = (/** @type {Response} */ res) => {
      res.header("Access-Control-Allow-Origin", this.config.http?.cors?.origin || "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Max-Age", "86400");
    };

    // 开始录制
    app.post("/api/record/start/:app/:name", /**
                                              * @param {Request} req @param {Response} res
                                              * @param res
                                              */ (req, res) => {
        addCorsHeaders(res);
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
        } catch (/** @type {unknown} */ error) {
          if (error instanceof Error) {
            res.status(500).json({ error: error.message });
          } else {
            res.status(500).json({ error: "An unknown error occurred" });
          }
        }
      });

    // 停止录制
    app.post("/api/record/stop/:sessionId", /**
                                             * @param {Request} req @param {Response} res
                                             * @param res
                                             */ (req, res) => {
        addCorsHeaders(res);
        const sessionId = req.params.sessionId;
        const session = Context.getSession(sessionId);
      
        if (!session) {
          return res.status(404).json({ error: `Record session not found with id: ${sessionId}` });
        }
        if (session.protocol !== "flv") {
          return res.status(400).json({ error: "Invalid session type. Expected a recording session" });
        }

        try {
          session.stop();
          res.json({ success: true });
        } catch (/** @type {unknown} */ error) {
          if (error instanceof Error) {
            res.status(500).json({ error: error.message });
          } else {
            res.status(500).json({ error: "An unknown error occurred" });
          }
        }
      });
  }
}

module.exports = NodeRecordApiServer;