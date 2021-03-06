/*
  Copyright 2014, Marten de Vries

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

"use strict";

var wrappers = require("pouchdb-wrappers");
var createChangeslikeWrapper = require("pouchdb-changeslike-wrapper");
var Security = require("pouchdb-security");
var PouchDBPluginError = require("pouchdb-plugin-error");

exports.installSystemDBProtection = function (db) {
  Security.installSecurityMethods.call(db);
  wrappers.installWrapperMethods(db, systemWrappers);
};

exports.uninstallSystemDBProtection = function (db) {
  wrappers.uninstallWrapperMethods(db, systemWrappers);
  Security.uninstallSecurityMethods.call(db);
};

function adminOnlyWrapper(error, orig, args) {
  var userCtx = (args.options || {}).userCtx || {
    //admin party
    name: null,
    roles: ["_admin"]
  };
  if (userCtx.roles.indexOf("_admin") !== -1) {
    //server admin can do everything
    return orig();
  }
  return args.db.getSecurity().then(function (security) {
    var dbAdmins = (security.admins || {});
    var isDbAdmin = (
      (dbAdmins.users || []).indexOf(userCtx.name) !== -1 ||
      (dbAdmins.roles || []).some(function (role) {
        return userCtx.roles.indexOf(role) !== -1;
      })
    );
    if (!isDbAdmin) {
      throw new PouchDBPluginError(error);
    }
    return orig();
  });
}

function create401(urlName) {
  return {
    status: 401,
    name: "unauthorized",
    message: "Only admins can access " + urlName + " of system databases."
  };
}

var systemWrappers = {};
systemWrappers.allDocs = adminOnlyWrapper.bind(null, create401("_all_docs"));
systemWrappers.changes = createChangeslikeWrapper(
  adminOnlyWrapper.bind(null, create401("_changes"))
);
systemWrappers.query = adminOnlyWrapper.bind(null, create401("_view (or _temp_view)"));

//CouchDB just crashes because of the 404 below for these. Use this
//error instead because PouchDB doesn't crash on it.
systemWrappers.sync = createChangeslikeWrapper(adminOnlyWrapper.bind(null, create401(".sync()")));
systemWrappers["replicate.from"] = createChangeslikeWrapper(
  adminOnlyWrapper.bind(null, create401(".replicate.from()"))
);
systemWrappers["replicate.to"] = createChangeslikeWrapper(
  adminOnlyWrapper.bind(null, create401(".replicate.to()"))
);

systemWrappers.get = adminOnlyWrapper.bind(null, {
  status: 404,
  name: "not_found",
  message: "missing"
});
systemWrappers.getAttachment = wrappers.get;
