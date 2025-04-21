import './style.css'

import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';

import '@maplibre/maplibre-gl-inspect/dist/maplibre-gl-inspect.css';
import MaplibreInspect from '@maplibre/maplibre-gl-inspect';

import {VectorTile} from '@mapbox/vector-tile';
import Protobuf from 'pbf';

async function loadTiles(url) {
    const tileJsonResponse = await fetch(url);
    const tileJson = await tileJsonResponse.json();

    // hard coded -- need to fix in future
    const zxy = getZXY(8, tileJson.bounds);
    const mvtUrl = tileJson.tiles[0]
        .replace('{z}', zxy.z)
        .replace('{x}', zxy.x)
        .replace('{y}', zxy.y);

    const geomType = await fetchMvt(mvtUrl);

    return {
        tileJson: tileJson,
        geomType: geomType
    };
    
}

function start(url) {
    loadTiles(url).then((d) => {
        const mapBounds = new maplibregl.LngLatBounds(d.tileJson.bounds);

        let sourceLayer, layerName;
        
        for(let vectorLayer of d.tileJson.vector_layers){
            sourceLayer = vectorLayer.id;
        }
        
        if(d.tileJson.tilestats) {
            for(let layer of d.tileJson.tilestats.layers){
                layerName = layer.layer;
            }
        }
        else {
            layerName = d.tileJson.vector_layers[0].id;
        }
        
        let layerType;
        
        switch(d.geomType){
            case "Point":
                layerType = "circle";
                break;
            case "LineString":
                layerType = "line";
                break;
            case "Polygon":
                layerType = "fill";
                break;
            default:
                layerType = "circle";
                
        }

        buildMap(mapBounds, sourceLayer, layerName, layerType, url);
    });

}

document.getElementById('search-btn').addEventListener("click", setTileUrl);




function isUrlValid(userInput) {
    var res = userInput.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g);
    if(res == null)
        return false;
    else
        return true;
}

function formatUrl(input) {
    if (!/^https?:\/\//i.test(input)) {
        return 'https://' + input;
    }
    return input;
}

function setTileUrl() {
    const input = document.getElementById('tile-search').value

    // check url for validity
    if(!isUrlValid(input))
        alert("Input is invalid, try again.");

    const url = formatUrl(input);

    start(url);
}

function getZXY(zoom, bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox;

    const topLeft = lngLatToTile(minLng, maxLat, zoom);
    const bottomRight = lngLatToTile(maxLng, minLat, zoom);

    const xMid = Math.floor((topLeft.x + bottomRight.x) / 2);
    const yMid = Math.floor((topLeft.y + bottomRight.y) / 2);

    return { z: zoom, x: xMid, y: yMid };
}


function lngLatToTile(lng, lat, z) {
    const x = Math.floor((lng + 180) / 360 * Math.pow(2, z));
    const y = Math.floor(
        (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)
    );
    return { x, y };
}


async function fetchMvt(mvtUrl){
    return await fetch(mvtUrl)
        .then(result => result.arrayBuffer())
        .then(buffer => {
            const tile = new VectorTile(new Protobuf(buffer));
            
            let geomType = '';

            for (const layerName in tile.layers) {
                const layer = tile.layers[layerName];
        
                const feature = layer.feature(0);

                switch (feature.type) {
                    case 1:
                        geomType = 'Point';
                        break;
                    case 2:
                        geomType = 'LineString';
                        break;
                    case 3:
                        geomType = 'Polygon';
                        break;
                    default:
                        geomType = 'Unknown';
                }

                break; // break out of for loop after first layer
            }
            
            return geomType;
        });
}


function buildMap(mapBounds, sourceLayer, layerName, layerType, url) {

    const map = new maplibregl.Map({
        container: 'map',
        bounds: mapBounds,
        style: 'https://tiles.openfreemap.org/styles/positron',
        hash: true
    });

    map.fitBounds(mapBounds, {padding: 40});
    
    // add zoom and rotate controls
    map.addControl(new maplibregl.NavigationControl({
        showZoom: true,
        showCompass: true
    }), 'top-left');
    
    
    map.once('load', () => {
        map.addLayer({
            id: layerName,
            type: layerType,
            source: {
                type: 'vector',
                url: url
            },
            'source-layer': sourceLayer
        });
        
        map.setPaintProperty(
            layerName,
            `${layerType}-opacity`,
            layerType === 'fill' ? 0.5 : 1
        );
    
        // Pass an initialized popup to Maplibre GL
        map.addControl(new MaplibreInspect({
            popup: new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false
            }),
    
            showInspectMap: false,
            showInspectButton: false,
            showMapPopup: true,
    
            queryParameters: {
                layers: [layerName]
            }
        }));

        //console.log(map.getSource('vt-source'));

    });
}



