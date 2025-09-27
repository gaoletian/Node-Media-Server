// @ts-check
//
//  Created by Chen Mingliang on 23/12/01.
//  illuspas@msn.com
//  Copyright (c) 2023 Nodemedia. All rights reserved.
//

const fs = require("fs");
const cors = require("cors");
const http = require("http");
const http2 = require("http2");
const express = require("express");
const logger = require("../core/logger.js");
const FlvSession = require("../session/flv_session.js");
const http2Express = require("../vendor/http2-express");
const NodeRecordApiServer = require("./record_api_server.js");

class NodeHttpServer {
  constructor(config) {
    /**@type {any} */
    this.config = config;
    const app = http2Express(express);

    if (config.static?.router && config.static?.root) {
      // @ts-ignore
      app.use(config.static.router, express.static(config.static.root));
    }
    
    // 初始化录制控制API服务
    const recordApiServer = new NodeRecordApiServer(config);
    recordApiServer.attachToApp(app);

    // 配置CORS
    const corsOptions = {
      origin: config.http?.cors?.origin || '*', // 允许的源，默认允许所有
      methods: config.http?.cors?.methods || ['GET', 'POST', 'OPTIONS'], // 允许的HTTP方法
      allowedHeaders: config.http?.cors?.allowedHeaders || ['Content-Type', 'Authorization'], // 允许的请求头
      credentials: config.http?.cors?.credentials || true, // 允许携带凭证
      exposedHeaders: ['Content-Length', 'Content-Range'], // 允许客户端访问的响应头
      maxAge: 86400, // 预检请求的结果可以缓存多久（秒）
    };

    // 确保所有路由都使用相同的CORS配置
    // @ts-ignore
    app.use(cors(corsOptions));
    
    // 处理 OPTIONS 请求
    // @ts-ignore
    app.options('*', cors(corsOptions));

    // @ts-ignore
    app.all("/:app/:name.flv", this.handleFlv);

    if (this.config.http?.port) {
      this.httpServer = http.createServer(app);
    }
    if (this.config.https?.port) {
      const opt = {
        key: fs.readFileSync(this.config.https.key),
        cert: fs.readFileSync(this.config.https.cert),
        allowHTTP1: true
      };
      this.httpsServer = http2.createSecureServer(opt, app);
    }

  }

  run = () => {
    this.httpServer?.listen(this.config.http.port, this.config.bind, () => {
      logger.info(`HTTP server listening on port ${this.config.bind}:${this.config.http.port}`);
    });
    this.httpsServer?.listen(this.config.https.port, this.config.bind, () => {
      logger.info(`HTTPS server listening on port ${this.config.bind}:${this.config.https.port}`);
    });
  };

  /**
   * @param {express.Request} req
   * @param {express.Response} res
   */
  handleFlv = (req, res) => {
    const session = new FlvSession(req, res);
    session.run();
  };
}

module.exports = NodeHttpServer;
