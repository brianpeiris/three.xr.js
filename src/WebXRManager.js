
THREE.WebXRManager = function( xrDisplays, renderer, camera, scene, updateCallback ) {

	this.renderer = renderer;
	this.camera = camera;
	this.scene = scene;

	var scope = this;
	var boundHandleFrame = handleFrame.bind(this); // Useful for setting up the requestAnimationFrame callback

	var frameData = null;

	var displays = xrDisplays;
	var display = null;

	var requestedFloor = false;
	var floorGroup = new THREE.Group();

	// an array of info that we'll use in _handleFrame to update the nodes using anchors
	var anchoredNodes = [] // { XRAnchorOffset, Three.js Object3D }

	function handleFrame(frame){
		const nextFrameRequest = this.session.requestFrame(boundHandleFrame);
		const headPose = frame.getViewPose(frame.getCoordinateSystem(XRCoordinateSystem.HEAD_MODEL));

		// If we haven't already, request the floor anchor offset
		if(requestedFloor === false){
			requestedFloor = true;
			frame.findFloorAnchor('first-floor-anchor').then(anchorOffset => {
				if(anchorOffset === null){
					console.error('could not find the floor anchor');
					return;
				}
				this.addAnchoredNode(anchorOffset, floorGroup);
			}).catch(err => {
				console.error('error finding the floor anchor', err)
			});
		}

		// Update anchored node positions in the scene graph
		for(let anchoredNode of anchoredNodes){
			this.updateNodeFromAnchorOffset(frame, anchoredNode.node, anchoredNode.anchorOffset)
		}

		// Let the extending class update the scene before each render
		this.updateScene(updateCallback, frame);

		// Prep THREE.js for the render of each XRView
		this.renderer.autoClear = false;
		this.renderer.setSize(this.session.baseLayer.framebufferWidth, this.session.baseLayer.framebufferHeight, false);
		this.renderer.clear();
		this.camera.matrixAutoUpdate = false;

		// Render each view into this.session.baseLayer.context
		for(const view of frame.views){
			// Each XRView has its own projection matrix, so set the camera to use that
			this.camera.projectionMatrix.fromArray(view.projectionMatrix);
			this.camera.matrix.fromArray(headPose.poseModelMatrix);
			this.camera.updateMatrixWorld(true);

			// Set up the renderer to the XRView's viewport and then render
			this.renderer.clearDepth();
			const viewport = view.getViewport(this.session.baseLayer);
			this.renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
			this.doRender();
		}
	}

	this.getDisplays = function () {

		return displays;

	};

	this.session = null;

	this.startSession = function (createVirtualReality=true, shouldStartPresenting=true) {
		var sessionInitParamers = {
			exclusive: createVirtualReality,
			type: createVirtualReality ? XRSession.REALITY : XRSession.AUGMENTATION
		}
		for(var displayObj of displays){
			if(displayObj.supportsSession(sessionInitParamers)){
				display = displayObj;
				break
			}
		}
		if(display === null){
			console.error('Could not find a display for this type of session');
			return
		}

		// Hack to receive WebVR 1.1 display info
		setTimeout( () => {
			display.requestSession(sessionInitParamers).then(session => {
				this.session = session
				this.session.depthNear = 0.1
				this.session.depthFar = 1000.0
	
				// Handle session lifecycle events
				this.session.addEventListener('focus', ev => { this.handleSessionFocus(ev) })
				this.session.addEventListener('blur', ev => { this.handleSessionBlur(ev) })
				this.session.addEventListener('end', ev => { this.handleSessionEnded(ev) })
	
				if(shouldStartPresenting){
					// VR Displays need startPresenting called due to input events like a click
					this.startPresenting();
				}
			}).catch(err => {
				console.error('Error requesting session', err);
			})
		}, 1000);
	};
	
	this.handleSessionFocus = function (ev) {
		console.log('handleSessionFocus');
	};

	this.handleSessionBlur = function (ev) {
		console.log('handleSessionBlur');
	};

	this.handleSessionEnded = function (ev) {
		console.log('handleSessionEnded');
	};

	this.handleLayerFocus = function (ev) {
		console.log('handleLayerFocus');
	};

	this.handleLayerBlur = function (ev) {
		console.log('handleLayerBlur');
	};
	
	/*
	Extending classes that need to update the layer during each frame should override this method
	*/
	this.updateScene = function (updateCallback, frame){
		updateCallback(frame);
	}

	this.startPresenting = function () {
		if(this.session === null){
			console.error('Can not start presenting without a session');
			throw new Error('Can not start presenting without a session');
		}

		// Set the session's base layer into which the app will render
		this.session.baseLayer = new XRWebGLLayer(this.session, renderer.context);

		// Handle layer focus events
		this.session.baseLayer.addEventListener('focus', ev => { this.handleLayerFocus(ev) })
		this.session.baseLayer.addEventListener('blur', ev => { this.handleLayerBlur(ev) })

		this.session.requestFrame(boundHandleFrame);
	}

	this.doRender = function () {
		this.renderer.render(this.scene, this.camera);
	}

	/*
	Add a node to the scene and keep its pose updated using the anchorOffset
	*/
	this.addAnchoredNode = function(anchorOffset, node){
		anchoredNodes.push({
			anchorOffset: anchorOffset,
			node: node
		})
		this.scene.add(node);
	}
	
	/*
	Get the anchor data from the frame and use it and the anchor offset to update the pose of the node, this must be an Object3D
	*/
	this.updateNodeFromAnchorOffset = function(frame, node, anchorOffset){
		const anchor = frame.getAnchor(anchorOffset.anchorUID)
		if(anchor === null){
			console.error('Unknown anchor uid', anchorOffset.anchorUID);
			return
		}

		node.matrixAutoUpdate = false;
		const offsetCoordinates = anchorOffset.getTransformedCoordinates(anchor);
		if(offsetCoordinates.coordinateSystem.type === XRCoordinateSystem.TRACKER){
			node.matrix.fromArray(offsetCoordinates.poseMatrix);
		} else {
			node.matrix.fromArray(
				offsetCoordinates.getTransformedCoordinates(frame.getCoordinateSystem(XRCoordinateSystem.TRACKER)).poseMatrix
			)
		}
		node.updateMatrixWorld(true);
	}
};

export default THREE.WebXRManager;