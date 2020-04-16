/* Magic Mirror
 * Module: mrx-work-traffic
 *
 * By Dominic Marx
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const request = require("request");
const moment = require("moment");

module.exports = NodeHelper.create({
    start: function () {
        console.log("====================== Starting node_helper for module [" + this.name + "]");
    },

    // subclass socketNotificationReceived
    socketNotificationReceived: function (notification, payload) {
        if (notification === "GOOGLE_TRAFFIC_GET") {
            //first data pull after new config
            this.getPredictions(payload);
        }
    },

    getPredictions: function(payload) {
        const self = this;
        let returned = 0;
        const predictions = [];
        payload.destinations.forEach(function (dest, index) {
            request({ url: dest.url, method: "GET" }, function (error, response, body) {
                const prediction = new Object({
                    config: dest.config
                });
                if(!error && response.statusCode === 200) {
                    const data = JSON.parse(body);
                    if (data.error_message) {
                        console.log("MMM-MyCommute: " + data.error_message);
                        prediction.error = true;
                        prediction.error_msg = data.error_message;
                    }
                    else if (data.status !== "OK") {
                        console.log("MMM-MyCommute: " + data.status);
                        prediction.error = true;
                        console.debug(data);
                        prediction.error_msg = "data.status != OK: " + data.status;
                    }
                    else {
                        const routeList = [];
                        for (let routeIndex = 0; routeIndex < data.routes.length; routeIndex++) {
                            const route = data.routes[routeIndex];
                            const routeObj = new Object({
                                summary: route.summary,
                                time: route.legs[0].duration.value
                            });

                            if(route.legs[0].duration_in_traffic) {
                                routeObj.timeInTraffic = route.legs[0].duration_in_traffic.value;
                            }
                            if(dest.config.mode && dest.config.mode === "transit") {
                                const transitInfo = [];
                                let gotFirstTransitLeg = false;
                                for (let stepIndex = 0; stepIndex < route.legs[0].steps.length; stepIndex++) {
                                    const step = route.legs[0].steps[stepIndex];
                                    if(step.transit_details) {
                                        let arrivalTime = "";
                                        if (!gotFirstTransitLeg && dest.config.showNextVehicleDeparture) {
                                            gotFirstTransitLeg = true;
                                            arrivalTime = moment(step.transit_details.departure_time.value * 1000);
                                        }
                                        transitInfo.push({ routeLabel: step.transit_details.line.short_name ? step.transit_details.line.short_name : step.transit_details.line.name,
                                            vehicle: step.transit_details.line.vehicle.type, arrivalTime: arrivalTime });
                                    }
                                }
                                routeObj.transitInfo = transitInfo;
                                if(transitInfo.length <= 0) {
                                    const travelModes = route.legs[0].steps.map(s => s.travel_mode).join(", ");
                                    console.log("MMM-MyCommute: transit directions does not contain any transits (" + travelModes + ")");
                                    prediction.error = true;
                                    prediction.error_msg = "Transit directions does not contain any transits (" + travelModes + ")";
                                }
                            }
                            routeList.push(routeObj);
                        }
                        prediction.routes = routeList;
                    }
                }
                else {
                    prediction.error = true;
                    if(response !== undefined) {
                        console.log("Error getting traffic prediction: " + response.statusCode);
                        prediction.error_msg = "Error getting traffic prediction: " + response.statusCode;
                    }
                    else {
                        console.log("Error getting traffic prediction: " + error);
                        prediction.error_msg = "Error getting traffic prediction: " + error;
                    }
                }
                predictions[index] = prediction;
                returned++;
                if (returned === payload.destinations.length) {
                    self.sendSocketNotification("GOOGLE_TRAFFIC_RESPONSE" + payload.instanceId, predictions);
                }
            });
        });
    }
});
