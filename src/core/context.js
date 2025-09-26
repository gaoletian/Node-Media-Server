// @ts-check
//
//  Created by Chen Mingliang on 24/11/28.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

const EventEmitter = require("node:events");

const Context = {
  config: {},

  /** @type {Map<string, any>} */
  sessions: new Map(),

  /** @type {Map<string, any>} */
  broadcasts: new Map(),

  eventEmitter: new EventEmitter(),

  /**
   * @param {string} sessionId
   * @returns {any}
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }
};

module.exports = Context;
