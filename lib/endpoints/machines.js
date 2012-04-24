/*
 * Copyright (c) 2012, Joyent, Inc. All rights reserved.
 *
 * A brief overview of this source file: what is its purpose.
 */

var assert = require('assert');
var restify = require('restify');
var ldap = require('ldapjs');
var sprintf = require('sprintf').sprintf;

var common = require('../common');

var uuid = require('node-uuid');

var VALID_MACHINE_ACTIONS = [
    'start',
    'stop',
    'reboot',
    'resize'
];


function validAction(action) {
    return VALID_MACHINE_ACTIONS.indexOf(action) != -1;
}


/*
 * GET /machines/:uuid
 *
 * Returns a list of machines according the specified search filter. The valid
 * query options are: owner_uuid, brand, alias, status, and ram.
 */
function listMachines(req, res, next) {
    req.log.trace('ListMachines start');

    req.ufds.listMachines(req.params, function (err, machines) {
        if (err)
            return next(err);

        res.send(200, machines);
        return next();
    });
}



/*
 * GET /machines/:uuid
 */
function getMachine(req, res, next) {
    req.log.trace('GetMachine start');
    res.send(200, common.translateMachine(req.machine));
    return next();
}



/*
 * POST /machines/:uuid
 */
function updateMachine(req, res, next) {
    req.log.trace('UpdateMachine start');
    var method;
    var action = req.params.action;

    if (!action)
        return next(new restify.MissingParameterError('action is required'));

    if (!validAction(action))
        return next(new restify.InvalidArgumentError('%s is not a valid action',
                                             req.params.action));

    switch (action) {
        case 'start':
            method = startMachine;
            break;
        case 'stop':
            method = stopMachine;
            break;
        case 'reboot':
            method = rebootMachine;
            break;
        case 'resize':
            method = resizeMachine;
            break;
    }

    method.call(this, req, res, next);
}



/*
 * Starts a machine with ?action=start
 */
function startMachine(req, res, next) {
    req.wfapi.createStartJob(req, function (err, juuid) {
        if (err)
            return next(err);

        req.machine.status = 'starting';
        var machine = common.translateMachine(req.machine);

        req.cache.set(machine.uuid, machine);
        res.header('Job-Location', '/jobs/' + juuid);
        res.send(200, machine);
        return next();
    });
}



/*
 * Stops a machine with ?action=stop
 */
function stopMachine(req, res, next) {
    req.wfapi.createStopJob(req, function (err, juuid) {
        if (err)
            return next(err);

        req.machine.status = 'stopping';
        var machine = common.translateMachine(req.machine);

        req.cache.set(machine.uuid, machine);
        res.header('Job-Location', '/jobs/' + juuid);
        res.send(200, machine);
        return next();
    });
}



/*
 * Reboots a machine with ?action=reboot
 */
function rebootMachine(req, res, next) {
    req.wfapi.createRebootJob(req, function (err, juuid) {
        if (err)
            return next(err);

        req.machine.status = 'rebooting';
        var machine = common.translateMachine(req.machine);

        req.cache.set(machine.uuid, machine);
        res.header('Job-Location', '/jobs/' + juuid);
        res.send(200, machine);
        return next();
    });
}



/*
 * Resizes a machine with ?action=resize
 */
function resizeMachine(req, res, next) {
    res.send(202);
    return next();
}



/*
 * Destroys a machine
 */
function destroyMachine(req, res, next) {
    req.wfapi.createDestroyJob(req, function (err, juuid) {
        if (err)
            return next(err);

        req.machine.status = 'destroying';
        var machine = common.translateMachine(req.machine);

        req.cache.set(machine.uuid, machine);
        res.header('Job-Location', '/jobs/' + juuid);
        res.send(200, machine);
        return next();
    });
}



/*
 * Creates a new machine. This endpoint returns a task id that can be used to
 * keep track of the machine provision
 */
function createMachine(req, res, next) {
    req.log.trace('CreateMachine start');

    try {
      common.validateMachine(req.params);
      common.setDefaultValues(req.params);

      req.wfapi.createProvisionJob(req, function (err, machineUuid, juuid) {
          if (err)
              return next(err);

          req.params.status = 'provisioning';
          req.params.uuid = machineUuid;

          var machine = common.translateMachine(req.params);

          req.cache.set(machineUuid, machine);
          res.header('Job-Location', '/jobs/' + juuid);
          res.send(201, machine);
          return next();
      });

    } catch (e) {
        return next(e);
    }
}



/*
 * Mounts machine actions as server routes
 */
function mount(server, before) {
    server.get({ path: '/machines', name: 'ListMachines' },
                 before, listMachines);

    server.post({ path: '/machines', name: 'CreateMachine' },
                  before, createMachine);

    server.get({ path: '/machines/:uuid', name: 'GetMachine' },
                 before, getMachine);

    server.del({ path: '/machines/:uuid', name: 'DestroyMachine' },
                 before, destroyMachine);

    server.post({ path: '/machines/:uuid', name: 'UpdateMachine' },
                  before, updateMachine);
}


// --- Exports

module.exports = {
    mount: mount
};