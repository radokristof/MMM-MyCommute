/*********************************

    Magic Mirror Module:
    MMM-MyCommute
    By Jeff Clarke

    Fork of mrx-work-traffic
    By Dominic Marx
    https://github.com/domsen123/mrx-work-traffic

    MIT Licensed

*********************************/

/* global config, Module, Log, moment */
Module.register("MMM-MyCommute", {
    defaults: {
        apiKey: "",
        origin: "65 Front St W, Toronto, ON M5J 1E6",
        lang: config.language,
        showSummary: true,
        showUpdated: true,
        colorCodeTravelTime: true,
        moderateTimeThreshold: 1.1,
        poorTimeThreshold: 1.3,
        nextTransitVehicleDepartureFormat: "[next at] h:mm a",
        travelTimeFormat: "m [min]",
        travelTimeFormatTrim: "left",
        pollFrequency: 10 * 60 * 1000,
        maxCalendarEvents: 0,
        maxCalendarTime: 24 * 60 * 60 * 1000,
        calendarOptions: [ { mode: "driving" } ],
        showArrivalTime: true,
        arrivalTimeFormat: "HH:mm",
        destinations: [
            {
                destination: "40 Bay St, Toronto, ON M5J 2X2",
                label: "Air Canada Centre",
                mode: "walking",
            },
            {
                destination: "317 Dundas St W, Toronto, ON M5T 1G4",
                label: "Art Gallery of Ontario",
                mode: "transit",
            }
        ]
    },

    getTranslations: function() {
        return {
            en: "translations/en.json",
            hu: "translations/hu.json",
            nl: "translations/nl.json"
        };
    },

    getScripts: function() {
        return [ "moment.js", this.file("node_modules/moment-duration-format/lib/moment-duration-format.js") ];
    },

    getStyles: function () {
        return [ "MMM-MyCommute.css", "font-awesome.css" ];
    },

    travelModes: [
        "driving",
        "walking",
        "bicycling",
        "transit"
    ],

    transitModes: [
        "bus",
        "subway",
        "train",
        "tram",
        "rail"
    ],

    avoidOptions: [
        "tolls",
        "highways",
        "ferries",
        "indoor"
    ],

    symbols: {
        "driving": "car",
        "walking": "walk",
        "bicycling": "bike",
        "transit": "streetcar",
        "tram": "streetcar",
        "bus":  "bus",
        "subway": "subway",
        "train": "train",
        "rail": "train",
        "metro_rail": "subway",
        "monorail": "train",
        "heavy_rail": "train",
        "commuter_train": "train",
        "high_speed_train": "train",
        "intercity_bus": "bus",
        "trolleybus": "streetcar",
        "share_taxi": "taxi",
        "ferry": "boat",
        "cable_car": "gondola",
        "gondola_lift": "gondola",
        "funicular": "gondola",
        "other": "streetcar"
    },

    start: function() {
        Log.info("Starting module: " + this.name);

        this.predictions = [];
        this.loading = true;
        this.inWindow = true;

        this.getData();
        this.rescheduleInterval();
    },

    rescheduleInterval: function() {
        const self = this;
        if(this.interval !== null) {
            clearInterval(this.interval);
        }
        this.interval = setInterval(function() {
            self.getData();
        }, this.config.pollFrequency);
    },

    suspend: function() {
        Log.log(this.name + " suspended.");
    },

    resume: function() {
        Log.log(this.name + " resumed.");
    },

    /*
        function isInWindow()

        @param start
            STRING display start time in 24 hour format e.g.: 06:00

        @param end
            STRING display end time in 24 hour format e.g.: 10:00

        @param hideDays
            ARRAY of numbers representing days of the week during which
            this tested item shall not be displayed.	Sun = 0, Sat = 6
            e.g.: [3,4] to hide the module on Wed & Thurs

        @return returns TRUE if current time is within start and end AND
        today is not in the list of days to hide.

    */
    isInWindow: function(start, end, hideDays) {
        const now = moment();
        const startTimeSplit = start.split(":");
        const endTimeSplit = end.split(":");
        const startTime = moment().hour(startTimeSplit[0]).minute(startTimeSplit[1]);
        const endTime = moment().hour(endTimeSplit[0]).minute(endTimeSplit[1]);

        return !(now.isBefore(startTime) || now.isAfter(endTime) || hideDays.indexOf(now.day()) !== -1);
    },

    appointmentDestinations: [],

    setAppointmentDestinations: function(payload) {
        this.appointmentDestinations = [];
        if(this.config.calendarOptions.length === 0) {
            return;
        }
        for(let eventIndex = 0; eventIndex < payload.length && this.appointmentDestinations.length < this.config.maxCalendarEvents; ++eventIndex) {
            const calendarEvent = payload[eventIndex];
            if("location" in calendarEvent &&
                    calendarEvent.location !== undefined &&
                    calendarEvent.location !== false &&
                    calendarEvent.startDate < (Date.now() + this.config.maxCalendarTime))
            {
                if(Date.now() < calendarEvent.startDate) {
                    Log.log(this.name + " adding calendar event " + calendarEvent.title)
                    this.appointmentDestinations.push.apply(this.appointmentDestinations,
                        this.config.calendarOptions.map( calOpt => Object.assign({}, calOpt, {
                            label: calendarEvent.title,
                            destination: calendarEvent.location,
                            arrival_time: calendarEvent.startDate / 1000,
                            color: calendarEvent.color
                        }))
                    );
                }
            }
        }
        this.appointmentDestinations = this.appointmentDestinations.slice(0, this.config.maxCalendarEvents);
    },

    getDestinations: function() {
        return this.config.destinations.concat(this.appointmentDestinations);
    },

    getData: function() {
        Log.log(this.name + " refreshing routes");
        let destinationGetInfo = [];
        const destinations = this.getDestinations();
        for(let destinationIndex = 0; destinationIndex < destinations.length; destinationIndex++) {
            const destination = destinations[destinationIndex];
            const destHideDays = destination.hideDays || [];
            if(Array.isArray(destination.startTime) && Array.isArray(destination.endTime)) {
                for(let index = 0; index < destination.startTime.length; index++) {
                    if(this.isInWindow(destination.startTime[index], destination.endTime[index], destHideDays)) {
                        Log.log(this.name + " destination " + destination.origin + " is in timeframe");
                        const url = "https://maps.googleapis.com/maps/api/directions/json" + this.getParams(destination);
                        destinationGetInfo.push({ url:url, config: destination});
                        break;
                    }
                }
            }
            else {
                const destStartTime = destination.startTime || "00:00";
                const destEndTime = destination.endTime || "23:59";

                if(this.isInWindow(destStartTime, destEndTime, destHideDays)) {
                    Log.log(this.name + " destination " + destination.origin + " is in timeframe");
                    const url = "https://maps.googleapis.com/maps/api/directions/json" + this.getParams(destination);
                    destinationGetInfo.push({ url:url, config: destination});
                }
            }
        }
        if(destinationGetInfo.length > 0) {
            this.sendSocketNotification("GOOGLE_TRAFFIC_GET", { destinations: destinationGetInfo, instanceId: this.identifier });
            Log.log(this.name + " requesting data from Google API");
            this.inWindow = true;
        }
        else {
            Log.log(this.name + " no destination available in the timeframe");
            this.hide(1000, { lockString: this.identifier });
            this.inWindow = false;
        }
    },

    getParams: function(dest) {
        let params = "?";
        params += "origin=" + encodeURIComponent(dest.origin || this.config.origin);
        params += "&destination=" + encodeURIComponent(dest.destination);
        params += "&key=" + this.config.apiKey;
        params += "&language=" + this.config.lang;

        // Travel mode
        let mode = "driving";
        if(dest.mode && this.travelModes.indexOf(dest.mode) !== -1) {
            mode = dest.mode;
        }
        params += "&mode=" + mode;

        // Transit mode if travelMode = "transit"
        if(mode === "transit" && dest.transitMode) {
            const tModes = dest.transitMode.split("|");
            let sanitizedTransitModes = "";
            for(let transportModesIndex = 0; transportModesIndex < tModes.length; transportModesIndex++) {
                if (this.transitModes.indexOf(tModes[transportModesIndex]) !== -1) {
                    sanitizedTransitModes += (sanitizedTransitModes === "" ? tModes[transportModesIndex] : "|" + tModes[transportModesIndex]);
                }
            }
            if (sanitizedTransitModes.length > 0) {
                params += "&transit_mode=" + sanitizedTransitModes;
            }
        }

        if(dest.waypoints) {
            const waypoints = dest.waypoints.split("|");
            for(let waypointsIndex = 0; waypointsIndex < waypoints.length; waypointsIndex++) {
                waypoints[waypointsIndex] = "via:" + encodeURIComponent(waypoints[waypointsIndex]);
            }
            params += "&waypoints=" + waypoints.join("|");
        }

        // Avoid
        if(dest.avoid) {
            const avoid = dest.avoid.split("|");
            let sanitizedAvoidOptions = "";
            for(let avoidIndex = 0; avoidIndex < avoid.length; avoidIndex++) {
                if (this.avoidOptions.indexOf(avoid[avoidIndex]) !== -1) {
                    sanitizedAvoidOptions += (sanitizedAvoidOptions === "" ? avoid[avoidIndex] : "|" + avoid[avoidIndex]);
                }
            }
            if (sanitizedAvoidOptions.length > 0) {
                params += "&avoid=" + sanitizedAvoidOptions;
            }
        }
        if(dest.alternatives === true) {
            params += "&alternatives=true";
        }

        if (dest.arrival_time) {
            Log.log(this.name + "using arrival time: " + dest.arrival_time)
            params += "&arrival_time=" + dest.arrival_time;
        }
        else {
            params += "&departure_time=now";
        }
        return params;
    },

    svgIconFactory: function(glyph) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttributeNS(null, "class", "transit-mode-icon");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttributeNS("http://www.w3.org/1999/xlink", "href", "modules/MMM-MyCommute/icon_sprite.svg#" + glyph);
        svg.appendChild(use);
        return(svg);
    },

    formatTime: function(time, timeInTraffic) {
        const timeElement = document.createElement("span");
        timeElement.classList.add("travel-time");
        let now = moment();
        if(timeInTraffic != null) {
            if(this.config.showArrivalTime) {
                timeElement.innerHTML = moment.duration(Number(timeInTraffic), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim }) + " - " +
                    now.add(Number(timeInTraffic), "seconds").format(this.config.arrivalTimeFormat);
            }
            else {
                timeElement.innerHTML = moment.duration(Number(timeInTraffic), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim });
            }
            const variance = timeInTraffic / time;
            if(this.config.colorCodeTravelTime) {
                if (variance > this.config.poorTimeThreshold) {
                    timeElement.classList.add("status-poor");
                }
                else if (variance > this.config.moderateTimeThreshold) {
                    timeElement.classList.add("status-moderate");
                }
                else {
                    timeElement.classList.add("status-good");
                }
            }
        }
        else {
            if(this.config.showArrivalTime) {
                timeElement.innerHTML = moment.duration(Number(time), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim }) + " - " + now.add(Number(time), "seconds").format(this.config.arrivalTimeFormat);
            }
            else {
                timeElement.innerHTML = moment.duration(Number(time), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim });
            }
            timeElement.classList.add("status-good");
        }
        return timeElement;
    },

    getTransitIcon: function(dest, route) {
        let transitIcon;
        if(dest.transitMode) {
            transitIcon = dest.transitMode.split("|")[0];
            if(this.symbols[transitIcon] != null) {
                transitIcon = this.symbols[transitIcon];
            }
            else {
                transitIcon = this.symbols[route.transitInfo[0].vehicle.toLowerCase()];
            }
        }
        else {
            transitIcon = this.symbols[route.transitInfo[0].vehicle.toLowerCase()];
        }
        return transitIcon;
    },

    buildTransitSummary: function(transitInfo, summaryContainer) {
        for(let transitInfoIndex = 0; transitInfoIndex < transitInfo.length; transitInfoIndex++) {
            const transitLeg = document.createElement("span");
            transitLeg.classList.add("transit-leg");
            transitLeg.appendChild(this.svgIconFactory(this.symbols[transitInfo[transitInfoIndex].vehicle.toLowerCase()]));

            const routeNumber = document.createElement("span");
            routeNumber.innerHTML = transitInfo[transitInfoIndex].routeLabel;

            if(transitInfo[transitInfoIndex].arrivalTime) {
                routeNumber.innerHTML = routeNumber.innerHTML + " (" + moment(transitInfo[transitInfoIndex].arrivalTime).format(this.config.nextTransitVehicleDepartureFormat) + ")";
            }
            transitLeg.appendChild(routeNumber);
            summaryContainer.appendChild(transitLeg);
        }
    },

    getDom: function() {
        const wrapper = document.createElement("div");
        if(this.loading) {
            const loading = document.createElement("div");
            loading.innerHTML = this.translate("LOADING");
            loading.className = "dimmed light small";
            wrapper.appendChild(loading);
            return wrapper;
        }

        const destinations = this.getDestinations();
        for(let predictionIndex = 0; predictionIndex < this.predictions.length; predictionIndex++) {
            const prediction = this.predictions[predictionIndex];
            const row = document.createElement("div");
            row.classList.add("row");
            const destination = document.createElement("span");
            destination.className = "destination-label bright";
            destination.innerHTML = prediction.config.label;
            row.appendChild(destination);

            const icon = document.createElement("span");
            icon.className = "transit-mode bright";
            let symbolIcon = "car";
            if(destinations[predictionIndex].color) {
                icon.setAttribute("style", "color:" + prediction.config.color);
            }
            if(prediction.config.mode && this.symbols[prediction.config.mode]) {
                symbolIcon = this.symbols[prediction.config.mode];
            }

            // Different rendering for single route vs multiple
            if(prediction.error) {
                // No routes available. Display an error instead.
                const errorTxt = document.createElement("span");
                errorTxt.classList.add("route-error");
                errorTxt.innerHTML = "Error: " + prediction.error_msg;
                row.appendChild(errorTxt);
                console.error("MMM-MyCommute error: " + prediction.error_msg, "Config: ", prediction.config);
            }
            else if(prediction.routes.length === 1 || !this.config.showSummary) {
                let route = prediction.routes[0];
                // Summary
                if(this.config.showSummary) {
                    let singleSummary = document.createElement("div");
                    singleSummary.classList.add("route-summary");
                    if (route.transitInfo) {
                        symbolIcon = this.getTransitIcon(prediction.config,route);
                        this.buildTransitSummary(route.transitInfo, singleSummary);
                    }
                    else {
                        singleSummary.innerHTML = route.summary;
                    }
                    singleSummary.appendChild(this.formatTime(route.time, route.timeInTraffic));
                    row.appendChild(singleSummary);
                }
                else {
                    row.appendChild(this.formatTime(route.time, route.timeInTraffic));
                }
            }
            else {
                row.classList.add("with-multiple-routes");
                for(let predictionRoutesIndex = 0; predictionRoutesIndex < prediction.routes.length; predictionRoutesIndex++) {
                    const routeSummaryOuter = document.createElement("div");
                    routeSummaryOuter.classList.add("route-summary-outer");
                    let route = prediction.routes[predictionRoutesIndex];

                    let multiSummary = document.createElement("div");
                    multiSummary.classList.add("route-summary");
                    if(route.transitInfo) {
                        symbolIcon = this.getTransitIcon(prediction.config, route);
                        this.buildTransitSummary(route.transitInfo, multiSummary);
                    }
                    else {
                        multiSummary.innerHTML = route.summary;
                    }
                    routeSummaryOuter.appendChild(multiSummary);
                    routeSummaryOuter.appendChild(this.formatTime(route.time, route.timeInTraffic));
                    row.appendChild(routeSummaryOuter);
                }
            }
            const svg = this.svgIconFactory(symbolIcon);
            icon.appendChild(svg);
            row.appendChild(icon);
            wrapper.appendChild(row);
        }

        if(this.config.showUpdated) {
            const updatedRow = document.createElement("div");
            updatedRow.classList.add("light");
            updatedRow.classList.add("xsmall");
            updatedRow.innerHTML = this.translate("LAST_REFRESHED") + this.lastUpdated.format("HH:mm");
            wrapper.appendChild(updatedRow);
        }
        return wrapper;
    },

    socketNotificationReceived: function(notification, payload) {
        if(notification === "GOOGLE_TRAFFIC_RESPONSE" + this.identifier) {
            this.predictions = payload;
            this.lastUpdated = moment();
            if(this.loading) {
                this.loading = false;
            }
            this.updateDom();
            this.show(1000, { lockString: this.identifier });
        }
    },

    notificationReceived: function(notification, payload) {
        if(notification === "DOM_OBJECTS_CREATED" && !this.inWindow) {
            this.hide(0, { lockString: this.identifier });
        }
        else if(notification === "CALENDAR_EVENTS") {
            this.setAppointmentDestinations(payload);
        }
    }
});
