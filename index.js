
let MIDI   = require('midi')
let Serial = require('serialport')
let Colors = require('colors')
console.log('Hi, Eric!')

// open midi connection
let midi = new MIDI.output()
midi.openVirtualPort('ExpressionsPad')
console.log('[ExpressionsPad]'.gray, 'channel is created...'.green)

let sensors = {
	lt: {value: 0, min: 210, max: 246, x: 0, y: 1},
	rt: {value: 0, min: 182, max: 196, x: 1, y: 1},
	lb: {value: 0, min: 213, max: 270, x: 0, y: 0},
	rb: {value: 0, min: 173, max: 370, x: 1, y: 0},
}

let load = {
	x : 0, 
	y : 0, 
	force : 0
}

let pads = [
	{x: 0, y: 0, r: 0.5, midi: 1},
	{x: 1, y: 1, r: 0.5, midi: 2}
]

let arduino = {connection: null, port: null}

let findArduino = () => {
	Serial.list().then(ports => {
		for (let i = 0; i < ports.length; i ++) {
			if (ports[i].manufacturer 
			&& 	ports[i].manufacturer.match('Arduino')) {
				console.log('Arduino Found!'.green)
				arduino.port = ports[i]
				connectToArduino()
				break
			}
		}
	}, err => { 
		console.log(err.red)
	})
}

let connectToArduino = port => {
	// open serial connection
	let connection = new Serial(arduino.port.comName, {
		baudRate : 9600, 
		lock	 : false
	})
	// get additional information
	connection.on('error', err => console.log(
		`[${arduino.port.manufacturer}]`.gray, 
		`error: ${err.message.red}`.red
	))
	connection.on('open', () => {
		console.log(
		`[${arduino.port.manufacturer}]`.gray, 
		`is connected...`.green)
		arduino.connection = connection
		parseReceivedData()
	})
}

let parseReceivedData = () => {
	let parser = new Serial.parsers.Readline('\n')
	arduino.connection.pipe(parser)
	parser.on('data', data => {
		let list = data.split('\t')
		if (list.length == 6) {
			sensors.lt.value = parseInt(list[1])
			sensors.rt.value = parseInt(list[2])
			sensors.lb.value = parseInt(list[0])
			sensors.rb.value = parseInt(list[3])
			// console.log(`[${port.manufacturer}]`.gray, sensors)
			convertToCursor()
		}
	})
}

let wasCalibrated = false

let convertToCursor = () => {
	// calibrate
	// if (!wasCalibrated) {
	// 	wasCalibrated = true
	// 	setTimeout(() => {
	// 		console.log(`[Arduino]`.gray, 'is calibrated!')
	// 		for (let i in sensors)
	// 			sensors[i].base = sensors[i].value
	// 	}, 500)
	// }
	// find position
	let x = 0
	let y = 0
	let sum = 0
	for (let i in sensors) {
		let calibrated = map(
			sensors[i].value,
			sensors[i].min, 
			sensors[i].max, 
			0, 1)
		x += calibrated * sensors[i].x
		y += calibrated * sensors[i].y
		sum += calibrated
	}
	sum = Math.max(sum, 0.00001)
	load.x = x / sum
	load.y = y / sum
	// find load
	load.force = sum / 4 / 2
	// if (wasCalibrated) {
	// 	// console.log(new Array(Math.max(Math.round(load.x * 1), 2)).fill('#').join(''))
	// 	// console.log(new Array(Math.max(Math.round(load.y * 1), 2)).fill('_').join(''))
	// }
	triggerPads()
}

let found = null

let triggerPads = () => {
	let collision = null
	pads.forEach(pad => {
		let distance = Math.sqrt(
			Math.pow(pad.x - load.x, 2) + 
			Math.pow(pad.y - load.y, 2))
		if (distance < pad.r) collision = pad
	})
	if (collision && load.force > 0.1) {
		onUserTriggersPad(collision)
		found = collision
	}
	if (!collision && found) {
		sendZero(found)
		found = null
	}
}

let onUserTriggersPad = pad => {
	let value = Math.min(Math.round(load.force * 127), 127)
	let msg = [176, pad.midi, value]
	console.log(`[${pad.midi}]`.gray, msg)
	midi.sendMessage(msg)
}

let sendZero = pad => {
	let msg = [176, pad.midi, 0]
	console.log(`[${pad.midi}]`.gray, msg)
	midi.sendMessage(msg)
}

findArduino()

// disconnect all the devices on exit
process.on('SIGINT', () => {
	// midi
	midi.closePort()
	console.log('\nMidi is disconnected!')
	if (arduino.connection != null) {
		arduino.connection.close()
		console.log(
			`[${arduino.port.manufacturer}]`.gray, 
			`is disconnected!`.green)
	}
	console.log('Buy Buy, Eric!')
})

let map = (value, aMin, aMax, bMin, bMax, clamp) => {
	var x = clamp == true? (
		value < aMin? aMin:
		value > aMax? aMax: value
	):  value
	return (
		(x - aMin) / 
		(aMax - aMin) * 
		(bMax - bMin) + bMin
	)
}

