/**
 * Ajedrez.js
 * 
 * Trabajo AGM #1. Ajedrez 3D con interaccion y animacion
 * Se trata de añadir un interfaz de usuario que permita 
 * cambiar el aspecto del tablero y las piezas, posicion de la camara de distintas vistas y etc
 * 
 * @author 
 * Zhen Feng
 */

/*
Model Information:
* title:	Chess pieces
* source:	https://sketchfab.com/3d-models/chess-pieces-6c30b70322ff4ebfb5874cf51a4e2bba
* author:	nikolokko (https://sketchfab.com/nikolokko)

Model License:
* license type:	CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
* requirements:	Author must be credited. Commercial use is allowed.
*/

// Modulos necesarios
import * as THREE from "../lib/three.module.js";
import {GLTFLoader} from "../lib/GLTFLoader.module.js";
import {OrbitControls} from "../lib/OrbitControls.module.js";
import {TWEEN} from "../lib/tween.module.min.js";
import {GUI} from "../lib/lil-gui.module.min.js";

// Variables de consenso
let renderer, scene, camera;

// Otras globales
let cameraControls, effectController;
let focal1, focal2;
let whiteMaterial, blackMaterial;
let texMetal, texPlastic, texWood;

// Variables para la interacción
let raycaster, mouse;
let selectedPiece = null;
let isMoving = false;

// Variables para el historial de acciones
let actionHistory = [];
let removedPieces = [];
let initialPiecePositions = new Map(); // Para almacenar las posiciones iniciales
let initialPieceStates = new Map(); // Para almacenar el estado inicial de las piezas
let promotedPieces = new Map(); // Para almacenar información sobre piezas promovidas

// Acciones
init();
loadScene();
loadGUI();
render();

function init()
{
    // Motor de render
    renderer = new THREE.WebGLRenderer();
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.getElementById('container').appendChild( renderer.domElement );
    renderer.antialias = true;
    renderer.shadowMap.enabled = true;
    
    // Inicializar raycaster y mouse para la interacción
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // Añadir event listeners para la interacción
    renderer.domElement.addEventListener('click', onMouseClick, false);
    renderer.domElement.addEventListener('contextmenu', onRightClick, false);
    window.addEventListener('resize', onWindowResize, false);

    // Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0.5,0.5,0.5);
    
    // Camara
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.position.set(5, 4, 5);
    cameraControls = new OrbitControls(camera, renderer.domElement);
    cameraControls.target.set(0, 0, 0);
    camera.lookAt(0, 0, 0);

    cameraControls.maxPolarAngle = Math.PI/2 - 0.1; // Prevent going below the board
    cameraControls.minDistance = 3;
    cameraControls.maxDistance = 10;

    // Luces
    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.4); 
    scene.add(ambientLight);

    const direccional = new THREE.DirectionalLight(0xFFFFFF, 0.6);
    direccional.position.set(4, 6, 4);
    direccional.castShadow = true;

    direccional.shadow.mapSize.width = 4096;
    direccional.shadow.mapSize.height = 4096;
    direccional.shadow.camera.near = 0.1;
    direccional.shadow.camera.far = 20;
    direccional.shadow.camera.left = -5;
    direccional.shadow.camera.right = 5;
    direccional.shadow.camera.top = 5;
    direccional.shadow.camera.bottom = -5;

    direccional.shadow.bias = -0.001;
    direccional.shadow.normalBias = 0.02;

    scene.add(direccional);

    focal1 = new THREE.SpotLight(0xFFFFFF, 0.4); 
    focal1.position.set(-4, 6, -4); 
    focal1.target.position.set(0, 0, 0);
    focal1.angle = Math.PI / 4;
    focal1.penumbra = 0.5; 
    focal1.castShadow = true;
    focal1.shadow.mapSize.width = 4096;
    focal1.shadow.mapSize.height = 4096;
    focal1.decay = 2;
    focal1.shadow.bias = -0.002;
    scene.add(focal1);

    focal2 = new THREE.SpotLight(0xFFFFFF, 0.4); 
    focal2.position.set(4, 6, 4);
    focal2.target.position.set(0, 0, 0);
    focal2.angle = Math.PI / 4;
    focal2.penumbra = 0.5;
    focal2.castShadow = true;
    focal2.shadow.mapSize.width = 4096;
    focal2.shadow.mapSize.height = 4096;
    focal2.decay = 2; 
    focal2.shadow.bias = -0.002;
    scene.add(focal2);
}

function loadScene()
{
    // Cargar Texturas
    const path ="./images/";
    const textureLoader = new THREE.TextureLoader();
    const chessboardTexture = textureLoader.load('images/chessboard.jpg');
    chessboardTexture.wrapS = THREE.RepeatWrapping;
    chessboardTexture.wrapT = THREE.RepeatWrapping;
    texMetal = textureLoader.load(path+"metal_128.jpg");
    texWood = textureLoader.load(path+"wood512.jpg");
    
    const floorMaterial = new THREE.MeshStandardMaterial({
        map: chessboardTexture,
        roughness: 0.8,
        metalness: 0.2
    });
    
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), floorMaterial);
    suelo.rotation.x = -Math.PI / 2;
    suelo.receiveShadow = true;
    scene.add(suelo);
    scene.add(new THREE.AxesHelper(3));

    // Materiales para las piezas
    whiteMaterial = new THREE.MeshStandardMaterial({
        color: 'white',
        roughness: 0.8,
        metalness: 0.2,
        envMapIntensity: 1.0
    });
    
    blackMaterial = new THREE.MeshStandardMaterial({
        color: 0x202020,
        roughness: 0.8,
        metalness: 0.2,
        envMapIntensity: 1.0
    });

    // Función para obtener la posición en el tablero
    function getBoardPosition(row, col) {
        const squareSize = 1;
        const boardOffset = 3.5;
        return {
            x: (col - boardOffset) * squareSize,
            z: (row - boardOffset) * squareSize
        };
    }

    // Funcion para crear una pieza
    function createPiece(mesh, material, row, col, pieceType) {
        const piece = mesh.clone();
        
        // Ajustar la escala y posición
        let scale = 0.7;
        piece.scale.set(scale, scale, scale);
        
        const pos = getBoardPosition(row, col);
        // Añadir una elevación para que las piezas estén sobre el tablero
        const elevation = 0.01;
        piece.position.set(pos.x, elevation, pos.z);
        piece.rotation.x = -Math.PI / 2;
        // Aplicar el material y la sombra a la pieza
        piece.traverse((child) => {
            if (child.isMesh) {
                child.material = material;
                child.material.side = THREE.DoubleSide;
                child.material.depthTest = true;
                child.material.depthWrite = true;
                child.material.normalMap = null;
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        if (pieceType == 'blackKing') {
            piece.rotation.z= Math.PI/2;
        }
        else if (pieceType == 'whiteKing') {
            piece.rotation.z= Math.PI/2;
        }
        else if (pieceType == 'whiteKnight') {
            piece.rotation.z= Math.PI;
        }
        
        // Guardar la posición inicial para el botón Start
        piece.userData.pieceType = pieceType;
        piece.userData.initialRow = row;
        piece.userData.initialCol = col;
        
        return piece;
    }

    const loader = new GLTFLoader();
    loader.load('chess/assets/chess_pieces/scene.gltf', function(gltf) {
        // Find individual piece meshes
        let pieceMeshes = {};
        gltf.scene.traverse((child) => {
            if (child.isMesh) {
                if (child.name.includes('Vert010')) {
                    pieceMeshes.blackPawn = child.parent;
                } else if (child.name.includes('Vert011')) {
                    pieceMeshes.blackRook = child.parent;
                } else if (child.name.includes('Vert009')) {
                    pieceMeshes.blackKnight = child.parent;
                } else if (child.name.includes('Vert008')) {
                    pieceMeshes.blackBishop = child.parent;
                } else if (child.name.includes('Vert007')) {
                    pieceMeshes.blackQueen = child.parent;
                } else if (child.name.includes('Vert006')) {
                    pieceMeshes.blackKing = child.parent;
                } else if (child.name.includes('Vert004')) {
                    pieceMeshes.whitePawn = child.parent;
                } else if (child.name.includes('Vert005')) {
                    pieceMeshes.whiteRook = child.parent;
                } else if (child.name.includes('Vert003')) {
                    pieceMeshes.whiteKnight = child.parent;
                } else if (child.name.includes('Vert002')) {
                    pieceMeshes.whiteBishop = child.parent;
                } else if (child.name.includes('Vert001')) {
                    pieceMeshes.whiteQueen = child.parent;
                } else if (child.name.includes('Vert__0')) {
                    pieceMeshes.whiteKing = child.parent;
                }
            }
        });

        // Create and position pieces
        const blackPieceOrder = ['blackRook', 'blackKnight', 'blackBishop', 'blackQueen', 'blackKing', 'blackBishop', 'blackKnight', 'blackRook'];
        const whitePieceOrder = ['whiteRook', 'whiteKnight', 'whiteBishop', 'whiteQueen', 'whiteKing', 'whiteBishop', 'whiteKnight', 'whiteRook'];
      
        // White back row
        for (let i = 0; i < 8; i++) {
            const piece = createPiece(pieceMeshes[whitePieceOrder[i]], whiteMaterial, 7, i, whitePieceOrder[i]);
            scene.add(piece);
            // Guardar la pieza en el mapa de estado inicial
            initialPieceStates.set(piece.id, {
                position: piece.position.clone(),
                rotation: piece.rotation.clone(),
                scale: piece.scale.clone(),
                pieceType: whitePieceOrder[i],
                row: 7,
                col: i
            });
        }

        // White pawns
        for (let i = 0; i < 8; i++) {
            const pawn = createPiece(pieceMeshes.whitePawn, whiteMaterial, 6, i, 'whitePawn');
            scene.add(pawn);
            // Guardar la pieza en el mapa de estado inicial
            initialPieceStates.set(pawn.id, {
                position: pawn.position.clone(),
                rotation: pawn.rotation.clone(),
                scale: pawn.scale.clone(),
                pieceType: 'whitePawn',
                row: 6,
                col: i
            });
        }

        // Black back row
        for (let i = 0; i < 8; i++) {
            const piece = createPiece(pieceMeshes[blackPieceOrder[i]], blackMaterial, 0, i, blackPieceOrder[i]);
            scene.add(piece);
            // Guardar la pieza en el mapa de estado inicial
            initialPieceStates.set(piece.id, {
                position: piece.position.clone(),
                rotation: piece.rotation.clone(),
                scale: piece.scale.clone(),
                pieceType: blackPieceOrder[i],
                row: 0,
                col: i
            });
        }

        // Black pawns
        for (let i = 0; i < 8; i++) {
            const pawn = createPiece(pieceMeshes.blackPawn, blackMaterial, 1, i, 'blackPawn');
            scene.add(pawn);
            // Guardar la pieza en el mapa de estado inicial
            initialPieceStates.set(pawn.id, {
                position: pawn.position.clone(),
                rotation: pawn.rotation.clone(),
                scale: pawn.scale.clone(),
                pieceType: 'blackPawn',
                row: 1,
                col: i
            });
        }

    }, undefined, function(error) {
        console.error("Failed to load GLTF model:", error);
    });
}

function loadGUI()
{
    // Definir configuración
    effectController = {
        materialType: 'Plastic',
        cameraView: 'Free',
        focalLight: {
            x: focal1.position.x,
            y: focal1.position.y,
            z: focal1.position.z
        },
        // Añadir funciones para los botones Start y Withdraw
        startGame: function() {
            // Recargar la página para reiniciar completamente el juego
            window.location.reload();
        },
        withdrawMove: function() {
            undoLastAction();
        },
        // Añadir función para el botón Promote
        promotePawn: function() {
            if (selectedPiece && isPawn(selectedPiece)) {
                showPromotionMenu();
            }
        },
        // Opciones de promoción
        promotionOption: 'Queen'
    };

    // Crear interfaz
    const gui = new GUI();

    // Material folder
    const materialFolder = gui.addFolder('Material');
    materialFolder.add(effectController, 'materialType', ['Plastic', 'Metal', 'Wood'])
        .name('Material Type')
        .onChange((value) => {
            let texture, metalness, roughness;
            switch(value) {
                case 'Metal':
                    texture = texMetal;
                    metalness = 0.7;
                    roughness = 0.2;
                    break;
                case 'Wood':
                    texture = texWood;
                    metalness = 0.1;
                    roughness = 0.9;
                    break;
                case 'Plastic':
                    texture = null;
                    metalness = 0.2;
                    roughness = 0.8;
                    break;
            }

            scene.traverse((child) => {
                if (child.isMesh && child.material) {
                    if (child.material === whiteMaterial || child.material === blackMaterial) {
                        child.material.map = texture;
                        child.material.metalness = metalness;
                        child.material.roughness = roughness;
                        child.material.needsUpdate = true;
                    }
                }
            });
        });

    // Camera folder
    const cameraFolder = gui.addFolder('Camera');
    cameraFolder.add(effectController, 'cameraView', ['Free', 'White', 'Black'])
        .name('Camera View')
        .onChange((value) => {
            switch(value) {
                case 'White':
                    camera.position.set(0, 3, 7);
                    cameraControls.target.set(0, 0, 0);
                    break;
                case 'Black':
                    camera.position.set(0, 3, -7);
                    cameraControls.target.set(0, 0, 0);
                    break;
                case 'Free':
                    camera.position.set(5, 4, 5);
                    cameraControls.target.set(0, 0, 0);
                    break;
            }
        });

    // Light folder
    const lightFolder = gui.addFolder('Focal Light');
    lightFolder.add(effectController.focalLight, 'x', -10, 10)
        .name('Position X')
        .onChange((value) => {
            focal1.position.x = value;
            focal2.position.x = -value;
        });
    lightFolder.add(effectController.focalLight, 'y', 0, 10)
        .name('Position Y')
        .onChange((value) => {
            focal1.position.y = value;
            focal2.position.y = value;
        });
    lightFolder.add(effectController.focalLight, 'z', -10, 10)
        .name('Position Z')
        .onChange((value) => {
            focal1.position.z = value;
            focal2.position.z = -value;
        });
        
    // Game control folder
    const gameFolder = gui.addFolder('Game Controls');
    gameFolder.add(effectController, 'startGame').name('Start');
    gameFolder.add(effectController, 'withdrawMove').name('Withdraw');
    
    // Promotion control
    const promoteButton = gameFolder.add(effectController, 'promotePawn').name('Promote');
    promoteButton.disable(); // Disabled by default
    
    // Promotion options (hidden by default)
    const promotionFolder = gui.addFolder('Promotion Options');
    promotionFolder.add(effectController, 'promotionOption', ['Queen', 'Rook', 'Bishop', 'Knight'])
        .name('Promote To');
        
    // Añadir un botón de confirmación para la promoción
    effectController.confirmPromotion = function() {
        if (selectedPiece && isPawn(selectedPiece)) {
            promotePawnTo(selectedPiece, effectController.promotionOption);
        }
    };
    
    promotionFolder.add(effectController, 'confirmPromotion').name('Confirm');
    promotionFolder.hide(); // Hidden by default
    effectController.promoteButton = promoteButton;
    effectController.promotionFolder = promotionFolder;
}

// Función para deshacer la última acción
function undoLastAction() {
    // Si hay una pieza seleccionada, deseleccionarla
    if (selectedPiece) {
        new TWEEN.Tween(selectedPiece.position)
            .to({ y: 0.01 }, 200)
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();
        selectedPiece = null;
    }
    
    // Si hay una animación en curso, cancelarla
    if (isMoving) {
        isMoving = false;
        TWEEN.removeAll();
    }
    
    // Obtener la última acción del historial
    const lastAction = actionHistory.pop();
    if (!lastAction) return; // No hay acciones para deshacer
    
    if (lastAction.type === 'move') {
        // Deshacer un movimiento
        const piece = lastAction.piece;
        if (piece && scene.getObjectById(piece.id)) {
            // Animar el retorno a la posición anterior
            new TWEEN.Tween(piece.position)
                .to({
                    x: lastAction.fromPosition.x,
                    y: lastAction.fromPosition.y,
                    z: lastAction.fromPosition.z
                }, 500)
                .easing(TWEEN.Easing.Quadratic.InOut)
                .start();
        }
    } else if (lastAction.type === 'remove') {
        // Deshacer una eliminación
        const piece = lastAction.piece;
        if (piece) {
            // Añadir la pieza de nuevo a la escena
            scene.add(piece);
            
            // Animar la aparición de la pieza
            piece.scale.set(0.01, 0.01, 0.01);
            piece.position.y = 1.0;
            
            // Hacer la pieza transparente inicialmente
            piece.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material = child.material.clone();
                    child.material.transparent = true;
                    child.material.opacity = 0;
                }
            });
            
            // Animar la escala
            const scaleTween = new TWEEN.Tween(piece.scale)
                .to({ x: 0.7, y: 0.7, z: 0.7 }, 500)
                .easing(TWEEN.Easing.Quadratic.Out);
                
            // Animar la opacidad
            const opacityTween = new TWEEN.Tween({ opacity: 0 })
                .to({ opacity: 1 }, 500)
                .easing(TWEEN.Easing.Quadratic.Out)
                .onUpdate((obj) => {
                    piece.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.opacity = obj.opacity;
                        }
                    });
                });
                
            // Animar la posición
            const positionTween = new TWEEN.Tween(piece.position)
                .to({ 
                    x: lastAction.position.x,
                    y: 0.01,
                    z: lastAction.position.z
                }, 500)
                .easing(TWEEN.Easing.Bounce.Out)
                .onComplete(() => {
                    // Restaurar material normal
                    piece.traverse((child) => {
                        if (child.isMesh) {
                            if (lastAction.pieceType.includes('white')) {
                                child.material = whiteMaterial;
                            } else {
                                child.material = blackMaterial;
                            }
                            child.material.transparent = false;
                        }
                    });
                });
                
            // Iniciar las animaciones
            scaleTween.start();
            opacityTween.start();
            positionTween.start();
            
            // Eliminar la pieza de la lista de piezas eliminadas
            removedPieces = removedPieces.filter(p => p.piece.id !== piece.id);
        }
    }
}

// Función para manejar el redimensionamiento de la ventana
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Función para manejar los clics del ratón
function onMouseClick(event) {
    // Evitar que el clic afecte a otros elementos
    event.preventDefault();
    
    // Si una pieza está en movimiento, ignorar el clic
    if (isMoving) return;
    
    // Calcular la posición del ratón en coordenadas normalizadas (-1 a +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Actualizar el raycaster con la posición del ratón y la cámara
    raycaster.setFromCamera(mouse, camera);
    
    // Si ya hay una pieza seleccionada, intentar moverla
    if (selectedPiece) {
        // Intersectar con el tablero para encontrar la posición de destino
        const boardIntersects = raycaster.intersectObjects([scene.children.find(child => 
            child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry)]);
        
        if (boardIntersects.length > 0) {
            // Obtener el punto de intersección con el tablero
            const targetPoint = boardIntersects[0].point;
            
            // Guardar la acción en el historial
            actionHistory.push({
                type: 'move',
                piece: selectedPiece,
                fromPosition: selectedPiece.position.clone(),
                toPosition: new THREE.Vector3(targetPoint.x, 0.01, targetPoint.z)
            });
            
            // Mover la pieza a la nueva posición
            movePieceTo(selectedPiece, targetPoint);
        }
    } else {
        // Si no hay pieza seleccionada, intentar seleccionar una
        // Filtrar solo los objetos que son piezas de ajedrez (excluyendo el tablero y otros objetos)
        const chessPieces = [];
        scene.traverse((object) => {
            // Las piezas de ajedrez son objetos que tienen hijos con materiales específicos
            if (object.children && object.children.length > 0) {
                const hasPieceMaterial = object.children.some(child => 
                    child.isMesh && (child.material === whiteMaterial || child.material === blackMaterial));
                if (hasPieceMaterial) {
                    chessPieces.push(object);
                }
            }
        });
        
        // Intersectar con las piezas de ajedrez
        const intersects = raycaster.intersectObjects(chessPieces, true);
        
        if (intersects.length > 0) {
            // Encontrar el objeto padre que es la pieza completa
            let piece = intersects[0].object;
            
            // Buscar el objeto raíz de la pieza de ajedrez
            // Recorrer hacia arriba en la jerarquía hasta encontrar un objeto que sea una pieza de ajedrez
            let rootPiece = null;
            for (const chessPiece of chessPieces) {
                // Comprobar si el objeto intersectado es parte de esta pieza
                let isPartOfPiece = false;
                chessPiece.traverse((child) => {
                    if (child === piece) {
                        isPartOfPiece = true;
                    }
                });
                
                if (isPartOfPiece) {
                    rootPiece = chessPiece;
                    break;
                }
            }
            
            // Si se encontró la pieza raíz, seleccionarla
            if (rootPiece) {
                selectPiece(rootPiece);
            }
        }
    }
}

// Función para comprobar si una pieza es un peón
function isPawn(piece) {
    return piece.userData.pieceType === 'whitePawn' || piece.userData.pieceType === 'blackPawn';
}

// Función para mostrar el menú de promoción
function showPromotionMenu() {
    if (effectController.promotionFolder) {
        effectController.promotionFolder.show();
    }
}

// Función para promover un peón a otra pieza
function promotePawnTo(pawn, pieceType) {
    // Si hay una animación en curso, ignorar
    if (isMoving) return;
    
    // Marcar que una pieza está en movimiento para evitar otras interacciones
    isMoving = true;
    
    // Determinar si es un peón blanco o negro
    const isWhite = pawn.userData.pieceType === 'whitePawn';
    const color = isWhite ? 'white' : 'black';
    
    // Guardar la posición y rotación actual
    const currentPosition = pawn.position.clone();
    const currentRotation = pawn.rotation.clone();
    
    // Animar el peón elevándose antes de transformarse
    new TWEEN.Tween(pawn.position)
        .to({ y: 1.0 }, 300)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
            // Buscar la pieza correspondiente en la escena para clonarla
            let newPieceType = '';
            switch(pieceType) {
                case 'Queen':
                    newPieceType = isWhite ? 'whiteQueen' : 'blackQueen';
                    break;
                case 'Rook':
                    newPieceType = isWhite ? 'whiteRook' : 'blackRook';
                    break;
                case 'Bishop':
                    newPieceType = isWhite ? 'whiteBishop' : 'blackBishop';
                    break;
                case 'Knight':
                    newPieceType = isWhite ? 'whiteKnight' : 'blackKnight';
                    break;
            }
            
            // Buscar un modelo de la pieza deseada en la escena
            let templatePiece = null;
            scene.traverse((object) => {
                if (object.userData && object.userData.pieceType === newPieceType) {
                    templatePiece = object;
                }
            });
            
            if (templatePiece) {
                // Clonar la pieza
                const newPiece = templatePiece.clone();
                
                // Configurar la nueva pieza
                newPiece.position.copy(currentPosition);
                newPiece.position.y = 1.0; // Mantener elevada para la animación
                newPiece.rotation.copy(currentRotation);
                newPiece.scale.set(0.01, 0.01, 0.01); // Empezar pequeña para animar
                newPiece.userData.pieceType = newPieceType;
                
                // Hacer la pieza transparente inicialmente
                newPiece.traverse((child) => {
                    if (child.isMesh && child.material) {
                        child.material = child.material.clone();
                        child.material.transparent = true;
                        child.material.opacity = 0;
                    }
                });
                
                // Guardar información sobre la promoción para poder revertirla
                promotedPieces.set(newPiece.id, {
                    originalPawnId: pawn.id,
                    originalPawnType: pawn.userData.pieceType,
                    originalPosition: currentPosition.clone(),
                    originalRotation: currentRotation.clone(),
                    initialState: initialPieceStates.get(pawn.id)
                });
                
                // Eliminar el peón de la escena
                scene.remove(pawn);
                
                // Añadir la nueva pieza a la escena
                scene.add(newPiece);
                
                // Animar la aparición de la nueva pieza
                const scaleTween = new TWEEN.Tween(newPiece.scale)
                    .to({ x: 0.7, y: 0.7, z: 0.7 }, 500)
                    .easing(TWEEN.Easing.Quadratic.Out);
                    
                const opacityTween = new TWEEN.Tween({ opacity: 0 })
                    .to({ opacity: 1 }, 500)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .onUpdate((obj) => {
                        newPiece.traverse((child) => {
                            if (child.isMesh && child.material) {
                                child.material.opacity = obj.opacity;
                            }
                        });
                    });
                    
                const positionTween = new TWEEN.Tween(newPiece.position)
                    .to({ y: 0.01 }, 500)
                    .easing(TWEEN.Easing.Bounce.Out)
                    .onComplete(() => {
                        // Restaurar material normal
                        newPiece.traverse((child) => {
                            if (child.isMesh) {
                                child.material = isWhite ? whiteMaterial : blackMaterial;
                            }
                        });
                        
                        // Resetear la selección y el estado de movimiento
                        selectedPiece = null;
                        isMoving = false;
                        
                        // Ocultar el menú de promoción
                        if (effectController.promotionFolder) {
                            effectController.promotionFolder.hide();
                        }
                        
                        // Desactivar el botón de promoción
                        if (effectController.promoteButton) {
                            effectController.promoteButton.disable();
                        }
                    });
                    
                // Iniciar las animaciones
                scaleTween.start();
                opacityTween.start();
                positionTween.start();
            } else {
                console.error("No se encontró una pieza de tipo", newPieceType, "para clonar");
                isMoving = false;
            }
        })
        .start();
}

// Función para seleccionar una pieza
function selectPiece(piece) {
    // Deseleccionar la pieza anterior si existe
    if (selectedPiece) {
        // Animar la pieza para bajarla a su posición original
        new TWEEN.Tween(selectedPiece.position)
            .to({ y: 0.01 }, 200)
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();
    }
    
    // Establecer la nueva pieza seleccionada
    selectedPiece = piece;
    
    // Animar la pieza para levantarla ligeramente
    new TWEEN.Tween(selectedPiece.position)
        .to({ y: 0.3 }, 200)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
    
    // Activar o desactivar el botón de promoción según si es un peón
    if (effectController.promoteButton) {
        if (isPawn(piece)) {
            effectController.promoteButton.enable();
        } else {
            effectController.promoteButton.disable();
        }
    }
}

// Función para mover una pieza a una nueva posición
function movePieceTo(piece, targetPoint) {
    // Marcar que una pieza está en movimiento
    isMoving = true;
    
    // Animar el movimiento de la pieza
    new TWEEN.Tween(piece.position)
        .to({ 
            x: targetPoint.x, 
            z: targetPoint.z 
        }, 500)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onComplete(() => {
            // Animar la pieza para bajarla a su posición final
            new TWEEN.Tween(piece.position)
                .to({ y: 0.01 }, 200)
                .easing(TWEEN.Easing.Bounce.Out)
                .onComplete(() => {
                    // Resetear la selección y el estado de movimiento
                    selectedPiece = null;
                    isMoving = false;
                })
                .start();
        })
        .start();
}

// Función para manejar el clic derecho (eliminar pieza)
function onRightClick(event) {
    // Evitar que aparezca el menú contextual
    event.preventDefault();
    
    // Si no hay pieza seleccionada o una pieza está en movimiento, ignorar el clic
    if (!selectedPiece || isMoving) return;
    
    // Marcar que una pieza está en movimiento para evitar otras interacciones
    isMoving = true;
    
    // Guardar la acción en el historial antes de eliminar la pieza
    actionHistory.push({
        type: 'remove',
        piece: selectedPiece,
        position: selectedPiece.position.clone(),
        pieceType: selectedPiece.userData.pieceType
    });
    
    // Guardar la pieza en la lista de piezas eliminadas
    removedPieces.push({
        piece: selectedPiece,
        initialPosition: initialPieceStates.get(selectedPiece.id)?.position || selectedPiece.position.clone(),
        pieceType: selectedPiece.userData.pieceType
    });
    
    // Animar la pieza para simular que es capturada (elevación, reducción y desaparición)
    // Primero elevamos la pieza
    new TWEEN.Tween(selectedPiece.position)
        .to({ y: 1.0 }, 300)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
            // Luego reducimos su tamaño y la hacemos transparente
            const originalScale = selectedPiece.scale.x;
            
            // Hacer transparentes todos los materiales de la pieza
            selectedPiece.traverse((child) => {
                if (child.isMesh && child.material) {
                    // Clonar el material para no afectar a otras piezas
                    child.material = child.material.clone();
                    // Habilitar transparencia
                    child.material.transparent = true;
                }
            });
            
            // Animar la escala y la opacidad
            const scaleTween = new TWEEN.Tween(selectedPiece.scale)
                .to({ x: 0.01, y: 0.01, z: 0.01 }, 500)
                .easing(TWEEN.Easing.Quadratic.In);
                
            const opacityTween = new TWEEN.Tween({opacity: 1})
                .to({ opacity: 0 }, 500)
                .easing(TWEEN.Easing.Quadratic.In)
                .onUpdate((obj) => {
                    // Actualizar la opacidad de todos los materiales
                    selectedPiece.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.opacity = obj.opacity;
                        }
                    });
                })
                .onComplete(() => {
                    // Eliminar la pieza de la escena
                    scene.remove(selectedPiece);
                    // Resetear la selección y el estado de movimiento
                    selectedPiece = null;
                    isMoving = false;
                });
                
            // Iniciar ambas animaciones simultáneamente
            scaleTween.start();
            opacityTween.start();
        })
        .start();
}

function update(delta)
{
    // Actualizar las animaciones de TWEEN
    TWEEN.update();
}

function render(delta)
{
    requestAnimationFrame( render );
    update();
    renderer.render( scene, camera );
}
