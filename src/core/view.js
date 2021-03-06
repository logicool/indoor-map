import {
    Vector3,
    Vector4,
    Matrix4,
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    AmbientLight,
    DirectionalLight,
    Raycaster,
} from '../libs/threejs'
import { addEvent } from '../utils/event'
import TWEEN from '../libs/Tween'
import { updateOverlays } from './overlays'

const PERSPECTIVE_FOV = 20

const __renderer__ = new WeakMap()
const __scene__ = new WeakMap()
const __camera__ = new WeakMap()

function updateModels(mo) {
    if (mo.mapScene) mo.mapScene.boundNeedsUpdate = true
    updateOverlays(mo)
}

function render(mo) {
    requestAnimationFrame(() => render(mo))
    if (!mo.mapScene) return

    let renderer = __renderer__.get(mo),
        scene = __scene__.get(mo),
        camera = __camera__.get(mo)

    let rerender = TWEEN.update()
    if (mo.needsUpdate) {
        mo._update_(scene, camera)
        camera.updateProjectionMatrix()
        mo.updateProjectionMatrix = true
        rerender = true
    } else if (mo.updateProjectionMatrix) {
        mo.updateProjectionMatrix = false
        rerender = true
    }
    if (rerender) {
        updateModels(mo)
        renderer.clearColor()
        renderer.render(scene, camera)
        renderer.clearDepth()
    }
}

function changeTheme(mo, theme) {
    function changeTheme(object) {
        if (object.onThemeChange) object.onThemeChange(theme)
        if (object.children && object.children.length > 0) {
            object.children.forEach(obj => changeTheme(obj))
        }
    }
    let { background = '#f9f9f9' } = theme
    if (typeof background === 'object') {
        let { color, alpha = 1 } = background
        clearRenderer(mo, color, alpha)
    } else {
        if (typeof background !== 'string') {
            background = '#f9f9f9'
        }
        clearRenderer(mo, background, 1)
    }
    mo.mapScene && changeTheme(mo.mapScene)
}

function viewMixin(XMap) {
    Object.assign(XMap.prototype, {
        clear() {
            this.mapScene && __scene__.get(this).remove(this.mapScene)
            this.mapScene = null
            this.clearOverlays()
            __renderer__.get(this).clear()
        },
        resize() {
            onMapResize(this)
        },
        locationToViewport: (function() {
            const worldPosition = new Vector3()
            const screenPosition = new Vector4()
            return function parseLocation(location) {
                worldPosition.copy(location)
                let floor = this.mapScene && this.mapScene.getFloor(location.floor)
                if (!floor) {
                    throw new Error('invalid floor')
                }
                if (!floor || !floor.visible) {
                    return {
                        x: -Infinity,
                        y: -Infinity,
                        distance: Infinity,
                    }
                } else {
                    floor.localToWorld(worldPosition)
                    let distance = worldPosition.distanceTo(__camera__.get(this).position)
                    worldPosition.project(__camera__.get(this))
                    screenPosition
                        .copy(worldPosition)
                        .applyMatrix4(__renderer__.get(this).viewportMatrix)
                        .round()
                    return {
                        x: screenPosition.x,
                        y: screenPosition.y,
                        distance: distance,
                    }
                }
            }
        })(),
    })
}

function initDom(mo) {
    mo.$mapWrapper = document.createElement('div')
    mo.$mapWrapper.className = 'xmap-container'
    mo.$wrapper.appendChild(mo.$mapWrapper)
    mo.$mapWrapper.style.opacity = 0

    mo.$overlayWrapper = document.createElement('div')
    mo.$overlayWrapper.className = 'xmap-overlays'
    mo.$wrapper.appendChild(mo.$overlayWrapper)

    mo.$controlWrapper = document.createElement('div')
    mo.$controlWrapper.className = 'xmap-controls'
    mo.$wrapper.appendChild(mo.$controlWrapper)
}

function initLights(scene) {
    let light = new AmbientLight(0x747474)
    scene.add(light)

    light = new DirectionalLight(0x888888, 1.2)
    light.position.set(4000, 4000, 4000).normalize()
    light.target.position.set(0, 0, 0)
    scene.add(light)

    light = new DirectionalLight(0x333333)
    light.position.set(-4000, -4000, 4000).normalize()
    scene.add(light)
}

function initThree(mo) {
    let width = mo.$wrapper.clientWidth,
        height = mo.$wrapper.clientHeight

    let scene = new Scene()
    __scene__.set(mo, scene)
    initLights(scene)

    let camera = new PerspectiveCamera(PERSPECTIVE_FOV, width / height, 200, 50000)
    camera.spriteScale = 1 / (height / 2 / Math.tan((camera.fov / 2 / 180) * Math.PI))
    __camera__.set(mo, camera)

    let renderer = new WebGLRenderer({
        antialias: true,
        // alpha: true,
    })
    renderer.autoClear = false
    renderer.autoClearColor = false
    renderer.autoClearDepth = false
    renderer.autoClearStencil = false
    renderer.setSize(width, height)
    __renderer__.set(mo, renderer)

    let $canvas = renderer.domElement
    $canvas.style.width = '100%'
    $canvas.style.height = '100%'
    mo.$mapWrapper.appendChild($canvas)

    Object.defineProperties(renderer, {
        viewportMatrix: {
            writable: false,
            value: new Matrix4(),
        },
    })
    let hw = width / 2,
        hh = height / 2
    renderer.viewportMatrix.set(hw, 0, 0, hw, 0, -hh, 0, hh)
}

function onMapResize(mo) {
    let width = mo.$wrapper.clientWidth,
        height = mo.$wrapper.clientHeight,
        camera = __camera__.get(mo),
        renderer = __renderer__.get(mo)
    camera.spriteScale = 1 / (height / 2 / Math.tan((camera.fov / 2 / 180) * Math.PI))

    camera.aspect = width / height
    camera.updateProjectionMatrix()

    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(width, height)
    let hw = width / 2,
        hh = height / 2
    renderer.viewportMatrix.set(hw, 0, 0, hw, 0, -hh, 0, hh)
    mo.updateProjectionMatrix = true
}

function initView(mo) {
    initDom(mo)
    initThree(mo)

    addEvent(window, 'resize', () => onMapResize(mo))
}

function clearRenderer(mo, color, alpha) {
    let renderer = __renderer__.get(mo)
    renderer.setClearColor(color, alpha)
    if (!mo.mapScene) renderer.clearColor()
    mo.$mapWrapper.style.opacity = 1
}

function loadModel(mo, model) {
    if (!model) return
    Object.defineProperties(model, {
        $map: {
            configurable: false,
            writable: false,
            value: mo,
        },
    })
    mo.mapScene = model
    let scene = __scene__.get(mo)
    scene.add(model)
}

function startRenderer(mo) {
    render(mo)
}

const getCameraRaycast = (function() {
    const raycaster = new Raycaster()
    const vector = new Vector3(0, 0, 0.5)

    return function(mo, point) {
        vector.x = (point.x / mo.$wrapper.clientWidth) * 2 - 1
        vector.y = -(point.y / mo.$wrapper.clientHeight) * 2 + 1
        raycaster.setFromCamera(vector, __camera__.get(mo))
        return raycaster
    }
})()

export { viewMixin, initView, clearRenderer, startRenderer, getCameraRaycast, loadModel, changeTheme }
