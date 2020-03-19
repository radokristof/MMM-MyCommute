/*********************************

    Magic Mirror Module:
    MMM-MyCommute
    By Jeff Clarke

    Fork of mrx-work-traffic
    By Dominic Marx
    https://github.com/domsen123/mrx-work-traffic

    MIT Licensed

*********************************/

/* global config, Module, Log, moment, cronJob */

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
                cron: "0 0/10 6,7,8,9,10 ? * MON,TUE,WED,THU,FRI *"
            },
            {
                destination: "317 Dundas St W, Toronto, ON M5T 1G4",
                label: "Art Gallery of Ontario",
                mode: "transit",
                cron: "0 0/10 6,7,8,9,10 ? * MON,TUE,WED,THU,FRI *"
            }
        ]
    },

    getTranslations: function() {
        return {
            en: "translations/en.json",
            hu: "translations/hu.json"
        };
    },

    getScripts: function() {
        return [
            "moment.js",
            this.file("node_modules/moment-duration-format/lib/moment-duration-format.js"),
            this.file("node_modules/cron/lib/cron.js")
        ];
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

        this.createCronJobs();
    },

    suspend: function() {
        Log.log(this.name + " suspended.");
    },

    resume: function() {
        Log.log(this.name + " resumed.");
    },

    cronJobs: [],

    filteredDestinations: [],

    filterUniquePrediction: function(payload) {
        for(let i = 0; i < this.predictions.length; i++) {
            if(this.predictions[i].config.label === payload.config.label) {
                this.predictions[i] = payload;
            }
        }
        this.predictions.push(payload);
    },

    filterUniqueDestination: function(element) {
        for(let i = 0; i < this.filteredDestinations.length; i++) {
            if(this.filteredDestinations[i].destination === element.destination) {
                return;
            }
        }
        this.filteredDestinations.push(element);
    },

    createCronJobs: function() {
        const self = this;
        for(let i = 0; i < this.config.destination.length; i++) {
            let job;
            if(this.config.destination[i].cron) {
                Log.log(this.name + " adding CronJob with expression: " + this.config.destination[i].cron);
                job = new CronJob(this.config.destination[i].cron, function () {
                    self.filterUniqueDestination(self.config.destination[i]);
                    self.getData(self.config.destination[i]);
                })
            }
            else {
                job = new CronJob("0 0/10 0 ? * * *", function () {
                    self.filterUniqueDestination(self.config.destination[i]);
                    self.getData(self.config.destination[i]);
                })
            }
            job.start();
            this.cronJobs.push(job);
        }
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
                this.appointmentDestinations.push.apply(this.appointmentDestinations,
                    this.config.calendarOptions.map( calOpt => Object.assign({}, calOpt, {
                        label: calendarEvent.title,
                        destination: calendarEvent.location,
                        arrival_time: calendarEvent.startDate
                    }))
                );
            }
        }
        this.appointmentDestinations = this.appointmentDestinations.slice(0, this.config.maxCalendarEvents);
    },

    getDestinations: function() {
        return this.filteredDestinations;
    },

    getData: function(destination) {
        Log.log(this.name + " refreshing routes");
        let destinationGetInfo = [];
        Log.log(this.name + " destination " + destination + " is in window");
        const url = "https://maps.googleapis.com/maps/api/directions/json" + this.getParams(destination);
        destinationGetInfo.push({ url:url, config: destination});

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
            params += "&arrival_time=" + dest.arrival_time;
        }
        else {
            params += "&departure_time=now";	// Needed for time based on traffic conditions
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
        const timeEl = document.createElement("span");
        timeEl.classList.add("travel-time");
        let now = moment();
        if(timeInTraffic != null) {
            if(this.config.showArrivalTime) {
                timeEl.innerHTML = moment.duration(Number(timeInTraffic), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim }) + " - " +
                    now.add(Number(timeInTraffic), "seconds").format(this.config.arrivalTimeFormat);
            }
            else {
                timeEl.innerHTML = moment.duration(Number(timeInTraffic), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim });
            }
            const variance = timeInTraffic / time;
            if(this.config.colorCodeTravelTime) {
                if (variance > this.config.poorTimeThreshold) {
                    timeEl.classList.add("status-poor");
                }
                else if (variance > this.config.moderateTimeThreshold) {
                    timeEl.classList.add("status-moderate");
                }
                else {
                    timeEl.classList.add("status-good");
                }
            }
        }
        else {
            if(this.config.showArrivalTime) {
                timeEl.innerHTML = moment.duration(Number(time), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim }) + " - " + now.add(Number(time), "seconds").format(this.config.arrivalTimeFormat);
            }
            else {
                timeEl.innerHTML = moment.duration(Number(time), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim });
            }
            timeEl.classList.add("status-good");
        }
        return timeEl;
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
                errorTxt.innerHTML = "Error";
                row.appendChild(errorTxt);

            }
            else if(prediction.routes.length === 1 || !this.config.showSummary) {
                let route = prediction.routes[0];
                // Summary
                if(this.config.showSummary) {
                    var singleSummary = document.createElement("div");
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

                    var multiSummary = document.createElement("div");
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
            this.lastUpdated = moment();
            if(this.loading) {
                this.loading = false;
            }
            this.filterUniquePrediction(payload);
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
