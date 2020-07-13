import Ajv from 'ajv';
// eslint-disable-next-line vitessce-rules/prevent-pubsub-import
import PubSub from 'pubsub-js';
import React, { useEffect, useState } from 'react';

import {
  STATUS_WARN, STATUS_INFO,
  CELLS_ADD, CLUSTERS_ADD, FACTORS_ADD, GENES_ADD, MOLECULES_ADD, NEIGHBORHOODS_ADD,
  CLEAR_PLEASE_WAIT, RASTER_ADD, CELL_SETS_ADD, RESET,
} from '../../events';

import cellsSchema from '../../schemas/cells.schema.json';
import clustersSchema from '../../schemas/clusters.schema.json';
import factorsSchema from '../../schemas/factors.schema.json';
import genesSchema from '../../schemas/genes.schema.json';
import moleculesSchema from '../../schemas/molecules.schema.json';
import neighborhoodsSchema from '../../schemas/neighborhoods.schema.json';
import rasterSchema from '../../schemas/raster.schema.json';
import cellSetsSchema from '../../schemas/cell-sets.schema.json';

const typeToSchema = {
  CELLS: cellsSchema,
  CLUSTERS: clustersSchema,
  FACTORS: factorsSchema,
  GENES: genesSchema,
  MOLECULES: moleculesSchema,
  NEIGHBORHOODS: neighborhoodsSchema,
  RASTER: rasterSchema,
  'CELL-SETS': cellSetsSchema,
};

const typeToEvent = {
  CELLS: CELLS_ADD,
  CLUSTERS: CLUSTERS_ADD,
  FACTORS: FACTORS_ADD,
  GENES: GENES_ADD,
  MOLECULES: MOLECULES_ADD,
  NEIGHBORHOODS: NEIGHBORHOODS_ADD,
  RASTER: RASTER_ADD,
  'CELL-SETS': CELL_SETS_ADD,
};

function warn(message) {
  PubSub.publish(STATUS_WARN, message);
}

function info(fileName) {
  PubSub.publish(STATUS_INFO, `Loaded ${fileName}.`);
}

function reset() {
  PubSub.publish(RESET, {});
}

function publishLayer(data, type, name, url) {
  const schema = typeToSchema[type];
  if (!schema) {
    throw Error(`No schema for ${type}`);
  }
  const validate = new Ajv().compile(schema);
  const valid = validate(data);
  if (!valid) {
    const failureReason = JSON.stringify(validate.errors, null, 2);
    warn(`Error while validating ${name}. Details in console.`);
    console.warn(`"${name}" (${type}) from ${url}: validation failed`, failureReason);
  }
  PubSub.publish(typeToEvent[type], data);
  info(name);
}

function loadLayer(layer) {
  const {
    name, type, url, requestInit = {},
  } = layer;
  fetch(url, requestInit)
    .then((response) => {
      if (response.ok) {
        response.json().then((data) => {
          publishLayer(data, type, name, url);
        }, (failureReason) => {
          warn(`Error while parsing ${name}. Details in console.`);
          console.warn(`"${name}" (${type}) from ${url}: parse failed`, failureReason);
        });
      } else {
        warn(`Error HTTP status from ${name}. Details in console.`);
        console.warn(`"${name}" (${type}) from ${url}: HTTP failed`, response.headers);
      }
    }, (failureReason) => {
      warn(`Error while fetching ${name}. Details in console.`);
      console.warn(`"${name}" (${type}) from ${url}: fetch failed`, failureReason);
    });
}

export default function SourcePublisher({ layers, height }) {
  const [pleaseWaits, setPleaseWaits] = useState({});

  useEffect(() => {
    function clearPleaseWait(event, layerName) {
      setPleaseWaits((prevPleaseWaits) => {
        const newPleaseWaits = { ...prevPleaseWaits };
        // TODO: Do not mutate! https://github.com/hubmapconsortium/vitessce/issues/148
        // eslint-disable-next-line no-param-reassign
        newPleaseWaits[layerName] = false;
        const waitingOn = Object.entries(newPleaseWaits)
          .filter(entry => entry[1])
          .map(entry => entry[0]);
        console.warn(
          `cleared "${layerName}"; waiting on ${waitingOn.length}:`,
          waitingOn,
        );
        return newPleaseWaits;
      });
    }
    reset();
    const newPleaseWaits = {};
    layers.map(layer => layer.name).forEach((name) => { newPleaseWaits[name] = true; });
    layers.forEach((layer) => {
      loadLayer(layer);
    });
    setPleaseWaits(newPleaseWaits);
    const token = PubSub.subscribe(
      CLEAR_PLEASE_WAIT, clearPleaseWait,
    );
    return () => PubSub.unsubscribe(token);
  }, [layers]);

  const unloadedLayers = Object.entries(pleaseWaits).filter(
    ([name, stillWaiting]) => stillWaiting, // eslint-disable-line no-unused-vars
  ).map(
    ([name, stillWaiting]) => name, // eslint-disable-line no-unused-vars
  );

  if (unloadedLayers.length) {
    return (
      <>
        <div className="modal">
          <div className="modal-dialog">
            <div
              className="please-wait-spinner"
              title="Please wait..."
              style={{ marginTop: `${(height - 100) / 2}px` }}
            />
          </div>
        </div>
        <div className="modal-backdrop show" />
      </>
    );
  }
  return null;
}
