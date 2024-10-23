const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');
const undoBtn = document.getElementById('undoBtn');
const exportBtn = document.getElementById('exportBtn');
const pointTypeSelector = document.getElementById('pointType');

// Add path option to selector if it doesn't exist
if (!Array.from(pointTypeSelector.options).some(option => option.value === 'path')) {
    const pathOption = document.createElement('option');
    pathOption.value = 'path';
    pathOption.textContent = 'Path';
    pointTypeSelector.appendChild(pathOption);
}

let points = [];
let connections = [];
let undoStack = [];
let isDragging = false;
let dragThreshold = 10;
let startPoint = null;
let initialClickPos = { x: 0, y: 0 };
let currentlyDrawing = false;
let nextStartId = 1;  // Counter for unique start point IDs

// Load the map PNG and scale it
const mapImage = new Image();
mapImage.src = 'map.png';
mapImage.onload = function() {
    resizeCanvas();
    draw();
};

window.addEventListener('resize', resizeCanvas);

function resizeCanvas() {
    const aspectRatio = mapImage.width / mapImage.height;
    if (window.innerWidth / window.innerHeight > aspectRatio) {
        canvas.height = window.innerHeight;
        canvas.width = canvas.height * aspectRatio;
    } else {
        canvas.width = window.innerWidth;
        canvas.height = canvas.width / aspectRatio;
    }
    draw();
}

function getNearestPoint(x, y, threshold = Infinity) {
    let nearestPoint = null;
    let minDistance = threshold;
    points.forEach(point => {
        const dx = point.x - x;
        const dy = point.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = point;
        }
    });
    return nearestPoint;
}

function promptForDestinationName() {
    return new Promise((resolve) => {
        const name = prompt('Enter a name for this destination:', '');
        resolve(name || 'Unnamed Destination');
    });
}

canvas.addEventListener('mousedown', function(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (mapImage.width / canvas.width);
    const y = (event.clientY - rect.top) * (mapImage.height / canvas.height);

    initialClickPos = { x, y };
    if (pointTypeSelector.value === 'path') {
        startPoint = getNearestPoint(x, y, 30);
    } else {
        startPoint = getNearestPoint(x, y);
    }
    isDragging = false;
    currentlyDrawing = true;
});

canvas.addEventListener('mousemove', function(event) {
    if (currentlyDrawing && startPoint) {
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (mapImage.width / canvas.width);
        const y = (event.clientY - rect.top) * (mapImage.height / canvas.height);

        const dx = x - initialClickPos.x;
        const dy = y - initialClickPos.y;

        if (Math.sqrt(dx * dx + dy * dy) > dragThreshold) {
            isDragging = true;
        }

        draw();
        if (isDragging) {
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(startPoint.x * canvas.width / mapImage.width, 
                      startPoint.y * canvas.height / mapImage.height);
            ctx.lineTo(x * canvas.width / mapImage.width, 
                      y * canvas.height / mapImage.height);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
});

canvas.addEventListener('mouseup', async function(event) {
    if (!currentlyDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (mapImage.width / canvas.width);
    const y = (event.clientY - rect.top) * (mapImage.height / canvas.height);

    const pointType = pointTypeSelector.value;

    if (isDragging && startPoint) {
        const nearestEndPoint = getNearestPoint(x, y, 30);
        
        if (pointType === 'path') {
            if (nearestEndPoint && nearestEndPoint !== startPoint) {
                connectPoints(startPoint, nearestEndPoint);
            }
        } else if (nearestEndPoint && nearestEndPoint !== startPoint && startPoint.type === 'start') {
            connectPoints(startPoint, nearestEndPoint);
        }
    } else if (pointType !== 'path') {
        const newPoint = { x, y, type: pointType };
        
        if (pointType === 'start') {
            newPoint.id = `start${nextStartId++}`;
        } else if (pointType === 'destination') {
            const name = await promptForDestinationName();
            newPoint.name = name;
        }
        
        points.push(newPoint);
        undoStack.push({ action: 'addPoint', point: newPoint });
        draw();
    }

    startPoint = null;
    isDragging = false;
    currentlyDrawing = false;
    draw();
});

function connectPoints(p1, p2) {
    const connectionExists = connections.some(conn => 
        (conn.p1 === p1 && conn.p2 === p2) || (conn.p1 === p2 && conn.p2 === p1)
    );
    
    if (!connectionExists) {
        connections.push({ p1, p2 });
        undoStack.push({ action: 'connectPoints', p1, p2 });
        draw();
    }
}

function undo() {
    const lastAction = undoStack.pop();
    if (!lastAction) return;

    if (lastAction.action === 'addPoint') {
        points.pop();
        if (lastAction.point.type === 'start') {
            nextStartId--;  // Decrement the counter when removing a start point
        }
    } else if (lastAction.action === 'connectPoints') {
        connections.pop();
    }
    draw();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(mapImage, 0, 0, canvas.width, canvas.height);

    // Draw connections
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    connections.forEach(conn => {
        ctx.beginPath();
        ctx.moveTo(conn.p1.x * canvas.width / mapImage.width, 
                  conn.p1.y * canvas.height / mapImage.height);
        ctx.lineTo(conn.p2.x * canvas.width / mapImage.width, 
                  conn.p2.y * canvas.height / mapImage.height);
        ctx.stroke();
    });

    // Draw points and labels
    points.forEach(point => {
        ctx.fillStyle = getColorForPointType(point.type);
        ctx.beginPath();
        ctx.arc(point.x * canvas.width / mapImage.width, 
               point.y * canvas.height / mapImage.height, 10, 0, 2 * Math.PI);
        ctx.fill();

        // Draw labels for start points and destinations
        if (point.id || point.name) {
            ctx.fillStyle = '#000';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(
                point.id || point.name,
                point.x * canvas.width / mapImage.width,
                (point.y * canvas.height / mapImage.height) - 15
            );
        }
    });
}

function getColorForPointType(type) {
    switch (type) {
        case 'start': return '#00ff00';
        case 'destination': return '#0000ff';
        case 'path': return '#ff0000';
        default: return '#ff0000';
    }
}

undoBtn.addEventListener('click', undo);

exportBtn.addEventListener('click', function() {
    const exportData = {
        points: points.map(point => ({
            ...point,
            x: Math.round(point.x),
            y: Math.round(point.y)
        })),
        connections: connections.map(conn => ({
            p1: {  // Changed from point1 to p1
                x: Math.round(conn.p1.x),
                y: Math.round(conn.p1.y),
                type: conn.p1.type,
                id: conn.p1.id || null,
                name: conn.p1.name || null
            },
            p2: {  // Changed from point2 to p2
                x: Math.round(conn.p2.x),
                y: Math.round(conn.p2.y),
                type: conn.p2.type,
                id: conn.p2.id || null,
                name: conn.p2.name || null
            }
        }))
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "map_data.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
});