const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
const info = document.getElementById('infoText');

// ==================== РЕЖИМ ====================
let currentMode = 'none';

// ==================== ЗАМЕДЛЕНИЕ ВРЕМЕНИ ====================
let timeScale = 1;

// ==================== ЗАЩИТА ОТ ЧАСТЫХ НАЖАТИЙ ====================
let lastClickTime = 0;

// ==================== МЕХАНИКА ====================
let mechanicsType = 'balls';
let balls = [
    { x: 300, y: 300, vx: 1, vy: 0, radius: 20, color: '#ff4444', mass: 2.0 },
    { x: 500, y: 200, vx: -1, vy: 0, radius: 20, color: '#44ff44', mass: 3.0 }
];
let selectedBallIndex = 0;
let draggingBall = null;

let springData = {
    x: 400, y: 150,
    mass: 2,
    stiffness: 0.02,
    length: 100,
    restLength: 100,
    velocity: 0,
    damping: 0.98,
    dragging: false
};

let pendulumData = {
    x: 400, y: 150,
    length: 120,
    angle: 0.5,
    angularVelocity: 0,
    mass: 2,
    damping: 0.99,
    dragging: false
};

// ==================== ОПТИКА ====================
let opticsData = {
    lightSource: { x: 150, y: 250 },
    lens: { x: 450, y: 250, type: 'converging' },
    mirror: { x: 700, y: 250 },
    incidentAngle: 0,
    ray: null
};

let draggingOpticsItem = null;

function calculateRefraction(incidentAngleDeg, n1, n2) {
    let incidentRad = incidentAngleDeg * Math.PI / 180;
    let sinTheta2 = (n1 / n2) * Math.sin(incidentRad);
    if (sinTheta2 > 1) return null;
    return Math.asin(sinTheta2) * 180 / Math.PI;
}

function generateRay() {
    let dx = opticsData.lens.x - opticsData.lightSource.x;
    let dy = opticsData.lens.y - opticsData.lightSource.y;
    let baseAngle = Math.atan2(dy, dx);
    let angleRad = baseAngle + (opticsData.incidentAngle * Math.PI / 180);
    
    let ray = {
        x: opticsData.lightSource.x,
        y: opticsData.lightSource.y,
        segments: [],
        incidentAngle: Math.abs(opticsData.incidentAngle),
        refractionAngle: null,
        passedLens: false
    };
    
    let currentX = opticsData.lightSource.x;
    let currentY = opticsData.lightSource.y;
    let currentAngle = angleRad;
    let hitLens = false;
    
    for (let step = 0; step < 80; step++) {
        let nextX = currentX + Math.cos(currentAngle) * 12;
        let nextY = currentY + Math.sin(currentAngle) * 12;
        
        let distToLensCenter = Math.hypot(currentX - opticsData.lens.x, currentY - opticsData.lens.y);
        let distToNextLensCenter = Math.hypot(nextX - opticsData.lens.x, nextY - opticsData.lens.y);
        
        if (!ray.passedLens && distToNextLensCenter < 50 && !hitLens) {
            hitLens = true;
            let n1 = 1.0, n2 = 1.5;
            let refractionDeg = calculateRefraction(ray.incidentAngle, n1, n2);
            if (refractionDeg !== null) {
                ray.refractionAngle = refractionDeg.toFixed(1);
                let offset = (nextY - opticsData.lens.y) / 40;
                currentAngle = currentAngle - (opticsData.lens.type === 'converging' ? offset * 0.8 : offset * 0.5);
                ray.segments.push({ x: currentX, y: currentY, toX: nextX, toY: nextY });
                currentX = nextX; currentY = nextY;
                ray.passedLens = true;
                continue;
            }
        }
        
        if (ray.passedLens && distToNextLensCenter > 55 && distToLensCenter < 55) {
            let offset = (nextY - opticsData.lens.y) / 40;
            currentAngle = currentAngle - (opticsData.lens.type === 'converging' ? offset * 0.6 : offset * 0.4);
        }
        
        if (Math.abs(nextX - opticsData.mirror.x) < 18 && Math.abs(nextY - opticsData.mirror.y) < 50) {
            let newAngle = -currentAngle + Math.PI;
            ray.segments.push({ x: currentX, y: currentY, toX: nextX, toY: nextY });
            currentX = opticsData.mirror.x + Math.cos(newAngle) * 20;
            currentY = opticsData.mirror.y + Math.sin(newAngle) * 20;
            currentAngle = newAngle;
            continue;
        }
        
        ray.segments.push({ x: currentX, y: currentY, toX: nextX, toY: nextY });
        currentX = nextX; currentY = nextY;
        if (currentX < -100 || currentX > canvas.width + 100 || currentY < -100 || currentY > canvas.height + 100) break;
    }
    opticsData.ray = ray;
}

// ==================== ЭЛЕКТРИЧЕСТВО ====================
let circuitData = {
    battery: { x: 450, y: 300, voltage: 12, positive: { x: 470, y: 315 }, negative: { x: 470, y: 380 } },
    components: [],
    wires: [],
    electrons: [],
    isCircuitClosed: false,
    current: 0,
    calculationMode: 'voltage',
    userValue: 12
};

let draggingComponent = null;
let isDrawingWire = false;
let wireStartPoint = null;
let tempWire = null;

function addComponent(type) {
    let startX = 550;
    let startY = 180;
    let stepX = 140;
    let stepY = 100;
    let cols = 3;
    let count = circuitData.components.length;
    let col = count % cols;
    let row = Math.floor(count / cols);
    
    let newComp = {
        id: Date.now() + Math.random(),
        type: type,
        x: startX + col * stepX,
        y: startY + row * stepY
    };
    
    if (type === 'lamp') { newComp.resistance = 100; newComp.on = false; }
    if (type === 'resistor') { newComp.resistance = 50; }
    if (type === 'ammeter') { newComp.current = 0; }
    if (type === 'voltmeter') { newComp.voltage = 0; }
    
    circuitData.components.push(newComp);
    calculateCircuit();
    info.innerText = `➕ Добавлен ${type}`;
}

function deleteLastComponent() {
    if (circuitData.components.length > 0) {
        circuitData.components.pop();
        calculateCircuit();
        info.innerText = '❌ Компонент удалён';
    }
}

function clearAll() {
    circuitData.components = [];
    circuitData.wires = [];
    circuitData.electrons = [];
    calculateCircuit();
    info.innerText = '🧹 Цепь очищена';
}

function addWire(x1, y1, x2, y2) {
    circuitData.wires.push({ x1, y1, x2, y2 });
    calculateCircuit();
    info.innerText = '✅ Провод добавлен';
}

function buildGraph() {
    let nodes = [];
    nodes.push({ id: 'battery_pos', x: circuitData.battery.positive.x, y: circuitData.battery.positive.y });
    nodes.push({ id: 'battery_neg', x: circuitData.battery.negative.x, y: circuitData.battery.negative.y });
    
    for (let i = 0; i < circuitData.components.length; i++) {
        let comp = circuitData.components[i];
        nodes.push({ id: `comp_${i}_in`, x: comp.x - 20, y: comp.y });
        nodes.push({ id: `comp_${i}_out`, x: comp.x + 20, y: comp.y });
    }
    
    let graph = new Map();
    for (let node of nodes) graph.set(node.id, []);
    
    for (let i = 0; i < circuitData.components.length; i++) {
        graph.get(`comp_${i}_in`).push({ nodeId: `comp_${i}_out` });
        graph.get(`comp_${i}_out`).push({ nodeId: `comp_${i}_in` });
    }
    
    for (let wire of circuitData.wires) {
        let startNode = null, endNode = null;
        let minDistStart = 25, minDistEnd = 25;
        for (let node of nodes) {
            let distToStart = Math.hypot(node.x - wire.x1, node.y - wire.y1);
            let distToEnd = Math.hypot(node.x - wire.x2, node.y - wire.y2);
            if (distToStart < minDistStart) { minDistStart = distToStart; startNode = node.id; }
            if (distToEnd < minDistEnd) { minDistEnd = distToEnd; endNode = node.id; }
        }
        if (startNode && endNode && startNode !== endNode) {
            graph.get(startNode).push({ nodeId: endNode });
            graph.get(endNode).push({ nodeId: startNode });
        }
    }
    return graph;
}

function checkCircuitClosed() {
    let graph = buildGraph();
    let visited = new Set();
    let queue = ['battery_pos'];
    visited.add('battery_pos');
    while (queue.length > 0) {
        let current = queue.shift();
        if (current === 'battery_neg') return true;
        let neighbors = graph.get(current) || [];
        for (let neighbor of neighbors) {
            if (!visited.has(neighbor.nodeId)) {
                visited.add(neighbor.nodeId);
                queue.push(neighbor.nodeId);
            }
        }
    }
    return false;
}

function calculateCircuit() {
    circuitData.isCircuitClosed = checkCircuitClosed();
    
    let totalResistance = 0;
    for (let comp of circuitData.components) {
        if (comp.type === 'lamp' || comp.type === 'resistor') {
            totalResistance += comp.resistance || 0;
        }
    }
    if (totalResistance === 0) totalResistance = 0.1;
    
    if (circuitData.calculationMode === 'voltage') {
        circuitData.battery.voltage = circuitData.userValue;
        circuitData.current = circuitData.battery.voltage / totalResistance;
    } else if (circuitData.calculationMode === 'current') {
        circuitData.current = circuitData.userValue;
        circuitData.battery.voltage = circuitData.current * totalResistance;
    } else if (circuitData.calculationMode === 'resistance') {
        circuitData.current = circuitData.battery.voltage / circuitData.userValue;
    }
    
    if (!circuitData.isCircuitClosed) {
        circuitData.current = 0;
        for (let comp of circuitData.components) {
            if (comp.type === 'lamp') comp.on = false;
            if (comp.type === 'ammeter') comp.current = 0;
            if (comp.type === 'voltmeter') comp.voltage = 0;
        }
        circuitData.electrons = [];
        return;
    }
    
    for (let comp of circuitData.components) {
        if (comp.type === 'lamp') comp.on = circuitData.current > 0.03;
        if (comp.type === 'ammeter') comp.current = circuitData.current;
        if (comp.type === 'voltmeter') {
            let resistors = circuitData.components.filter(c => c.type === 'lamp' || c.type === 'resistor');
            comp.voltage = resistors[0] ? circuitData.current * resistors[0].resistance : circuitData.battery.voltage;
        }
    }
    
    if (circuitData.isCircuitClosed && circuitData.current > 0.03) {
        let path = [{ x: circuitData.battery.positive.x, y: circuitData.battery.positive.y }];
        for (let comp of circuitData.components) {
            path.push({ x: comp.x - 20, y: comp.y });
            path.push({ x: comp.x + 20, y: comp.y });
        }
        path.push({ x: circuitData.battery.negative.x, y: circuitData.battery.negative.y });
        if (circuitData.electrons.length === 0) {
            for (let i = 0; i < 25; i++) circuitData.electrons.push({ pos: i, speed: circuitData.current * 8 });
        }
        for (let e of circuitData.electrons) {
            e.pos += e.speed;
            if (e.pos >= path.length) e.pos = 0;
        }
    } else {
        circuitData.electrons = [];
    }
}

// ==================== ФИЗИКА МЕХАНИКИ ====================
function updateMechanics() {
    const GRAVITY = 0.5 / timeScale;
    if (mechanicsType === 'balls') {
        for (let ball of balls) {
            ball.vy += GRAVITY;
            ball.x += ball.vx / timeScale;
            ball.y += ball.vy / timeScale;
            if (ball.x - ball.radius < 0) { ball.x = ball.radius; ball.vx = -ball.vx * 0.7; }
            if (ball.x + ball.radius > canvas.width) { ball.x = canvas.width - ball.radius; ball.vx = -ball.vx * 0.7; }
            if (ball.y - ball.radius < 0) { ball.y = ball.radius; ball.vy = -ball.vy * 0.7; }
            if (ball.y + ball.radius > canvas.height) {
                ball.y = canvas.height - ball.radius;
                if (Math.abs(ball.vy) < 2 / timeScale) ball.vy = 0;
                else ball.vy = -ball.vy * 0.5;
                ball.vx *= 0.98;
            }
        }
        for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
                let b1 = balls[i], b2 = balls[j];
                let dx = b2.x - b1.x, dy = b2.y - b1.y;
                let dist = Math.hypot(dx, dy);
                let minDist = b1.radius + b2.radius;
                if (dist < minDist) {
                    let angle = Math.atan2(dy, dx);
                    let overlap = minDist - dist;
                    b1.x -= Math.cos(angle) * overlap / 2;
                    b1.y -= Math.sin(angle) * overlap / 2;
                    b2.x += Math.cos(angle) * overlap / 2;
                    b2.y += Math.sin(angle) * overlap / 2;
                    let nx = dx / dist, ny = dy / dist;
                    let vrelx = b2.vx - b1.vx, vrely = b2.vy - b1.vy;
                    let dot = vrelx * nx + vrely * ny;
                    if (dot < 0) {
                        let e = 0.8;
                        let impulse = (1 + e) * dot / (1/b1.mass + 1/b2.mass);
                        b1.vx += impulse * nx / b1.mass;
                        b1.vy += impulse * ny / b1.mass;
                        b2.vx -= impulse * nx / b2.mass;
                        b2.vy -= impulse * ny / b2.mass;
                    }
                }
            }
        }
    } else if (mechanicsType === 'spring') {
        if (!springData.dragging) {
            let displacement = springData.length - springData.restLength;
            let force = -springData.stiffness * displacement;
            let acceleration = force / springData.mass;
            springData.velocity += acceleration / timeScale;
            springData.velocity *= springData.damping;
            springData.length += springData.velocity / timeScale;
            if (springData.length < 50) springData.length = 50;
            if (springData.length > 200) springData.length = 200;
        }
    } else if (mechanicsType === 'pendulum') {
        if (!pendulumData.dragging) {
            let alpha = -(0.5 / timeScale / pendulumData.length) * Math.sin(pendulumData.angle);
            pendulumData.angularVelocity += alpha;
            pendulumData.angularVelocity *= pendulumData.damping;
            pendulumData.angle += pendulumData.angularVelocity / timeScale;
        }
    }
}

// ==================== ОТРИСОВКА СТРЕЛКИ ====================
function drawArrow(x, y, vx, vy, color) {
    let len = Math.hypot(vx, vy);
    if (len < 0.5) return;
    let endX = x + vx * 12, endY = y + vy * 12;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    let angle = Math.atan2(vy, vx);
    let arrowSize = 10;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - arrowSize * Math.cos(angle - Math.PI/6), endY - arrowSize * Math.sin(angle - Math.PI/6));
    ctx.lineTo(endX - arrowSize * Math.cos(angle + Math.PI/6), endY - arrowSize * Math.sin(angle + Math.PI/6));
    ctx.fillStyle = color;
    ctx.fill();
}

// ==================== ОТРИСОВКА МЕХАНИКИ ====================
function drawMechanics() {
    if (mechanicsType === 'balls') {
        for (let i = 0; i < balls.length; i++) {
            let b = balls[i];
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2);
            ctx.fillStyle = b.color;
            ctx.fill();
            ctx.strokeStyle = i === selectedBallIndex ? 'white' : '#888';
            ctx.lineWidth = i === selectedBallIndex ? 4 : 2;
            ctx.stroke();
            ctx.fillStyle = '#ffaa44';
            ctx.font = 'bold 20px monospace';
            ctx.fillText(`${b.mass.toFixed(1)} кг`, b.x-14, b.y-18);
            drawArrow(b.x, b.y, b.vx, b.vy, '#ffff00');
        }
        
        let b = balls[selectedBallIndex];
        let v = Math.hypot(b.vx, b.vy);
        let ke = 0.5 * b.mass * v * v;
        let pe = b.mass * 5 * (canvas.height - b.y) / 10;
        let finalKe = (v < 0.05) ? 0 : ke;
        let finalPe = ((canvas.height - b.y) < 0.5 || v < 0.05) ? 0 : pe;
        
        ctx.fillStyle = '#0a0f1acc';
        ctx.fillRect(canvas.width-230, 10, 220, 180);
        ctx.strokeStyle = 'white';
        ctx.strokeRect(canvas.width-230, 10, 220, 180);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('📊 ЭНЕРГИЯ ШАРА', canvas.width-220, 30);
        ctx.font = '11px monospace';
        ctx.fillStyle = '#ffaa88';
        ctx.fillText(`Кинет.: ${finalKe.toFixed(1)} Дж`, canvas.width-220, 55);
        ctx.fillText(`Потенц.: ${finalPe.toFixed(1)} Дж`, canvas.width-220, 75);
        ctx.fillStyle = '#88ff88';
        ctx.fillText(`Полная: ${(finalKe+finalPe).toFixed(1)} Дж`, canvas.width-220, 95);
        ctx.fillStyle = '#88aaff';
        ctx.fillText(`Масса: ${b.mass.toFixed(1)} кг`, canvas.width-220, 120);
        ctx.fillText(`Скорость: ${v.toFixed(1)} м/с`, canvas.width-220, 140);
        
        ctx.fillStyle = '#88ff88';
        ctx.fillRect(canvas.width-200, 155, 30, 22);
        ctx.fillStyle = '#ff8888';
        ctx.fillRect(canvas.width-155, 155, 30, 22);
        ctx.fillStyle = 'black';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('+', canvas.width-190, 173);
        ctx.fillText('-', canvas.width-145, 173);
        ctx.fillStyle = '#88aaff';
        ctx.font = '11px monospace';
        ctx.fillText('масса', canvas.width-195, 152);
    }
    else if (mechanicsType === 'spring') {
        let topY = 100;
        let bottomY = topY + springData.length;
        
        ctx.beginPath();
        ctx.moveTo(springData.x, topY);
        for (let i = 0; i <= 12; i++) {
            let t = i / 12;
            let y = topY + t * springData.length;
            let x = springData.x + (i % 2 === 0 ? 18 : -18);
            ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#88ff88';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.fillStyle = '#ff8888';
        ctx.fillRect(springData.x-18, bottomY-12, 36, 24);
        ctx.fillStyle = 'white';
        ctx.fillText(`${springData.mass} кг`, springData.x-10, bottomY+3);
        
        let displacement = springData.length - springData.restLength;
        let pe = 0.5 * springData.stiffness * displacement * displacement;
        let ke = 0.5 * springData.mass * springData.velocity * springData.velocity;
        
        ctx.fillStyle = '#0a0f1acc';
        ctx.fillRect(canvas.width-280, 10, 270, 230);
        ctx.strokeStyle = 'white';
        ctx.strokeRect(canvas.width-280, 10, 270, 230);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('📊 ПРУЖИНА', canvas.width-270, 30);
        ctx.font = '11px monospace';
        ctx.fillStyle = '#ffaa88';
        ctx.fillText(`Потенц.: ${pe.toFixed(1)} Дж`, canvas.width-270, 55);
        ctx.fillText(`Кинет.: ${ke.toFixed(1)} Дж`, canvas.width-270, 75);
        ctx.fillStyle = '#88ff88';
        ctx.fillText(`Полная: ${(pe+ke).toFixed(1)} Дж`, canvas.width-270, 95);
        ctx.fillStyle = '#88aaff';
        ctx.fillText(`Жёсткость: ${springData.stiffness.toFixed(3)}`, canvas.width-270, 120);
        ctx.fillText(`Масса: ${springData.mass} кг`, canvas.width-270, 140);
        ctx.fillText(`Скорость: ${Math.abs(springData.velocity).toFixed(1)} м/с`, canvas.width-270, 160);
        ctx.fillText(`Растяжение: ${displacement.toFixed(1)} см`, canvas.width-270, 180);
        
        ctx.fillStyle = '#88aaff';
        ctx.font = '11px monospace';
        ctx.fillText('ЖЁСТКОСТЬ', canvas.width-260, 205);
        ctx.fillStyle = '#88ff88';
        ctx.fillRect(canvas.width-245, 208, 20, 16);
        ctx.fillStyle = '#ff8888';
        ctx.fillRect(canvas.width-220, 208, 20, 16);
        ctx.fillStyle = 'black';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('+', canvas.width-239, 221);
        ctx.fillText('-', canvas.width-214, 221);
        
        ctx.fillStyle = '#88aaff';
        ctx.font = '11px monospace';
        ctx.fillText('МАССА', canvas.width-180, 205);
        ctx.fillStyle = '#88ff88';
        ctx.fillRect(canvas.width-165, 208, 20, 16);
        ctx.fillStyle = '#ff8888';
        ctx.fillRect(canvas.width-140, 208, 20, 16);
        ctx.fillStyle = 'black';
        ctx.fillText('+', canvas.width-159, 221);
        ctx.fillText('-', canvas.width-134, 221);
    }
    else if (mechanicsType === 'pendulum') {
        let bobX = pendulumData.x + Math.sin(pendulumData.angle) * pendulumData.length;
        let bobY = pendulumData.y + Math.cos(pendulumData.angle) * pendulumData.length;
        
        ctx.beginPath();
        ctx.moveTo(pendulumData.x, pendulumData.y);
        ctx.lineTo(bobX, bobY);
        ctx.strokeStyle = '#ffaa88';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(bobX, bobY, 15, 0, Math.PI*2);
        ctx.fillStyle = '#ff8888';
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillText(`${pendulumData.mass} кг`, bobX-8, bobY+4);
        
        let v = Math.abs(pendulumData.angularVelocity * pendulumData.length / 10);
        let ke = 0.5 * pendulumData.mass * v * v;
        let h = pendulumData.length * (1 - Math.cos(pendulumData.angle));
        let pe = pendulumData.mass * 5 * h;
        
        ctx.fillStyle = '#0a0f1acc';
        ctx.fillRect(canvas.width-280, 10, 270, 230);
        ctx.strokeStyle = 'white';
        ctx.strokeRect(canvas.width-280, 10, 270, 230);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('📊 МАЯТНИК', canvas.width-270, 30);
        ctx.font = '11px monospace';
        ctx.fillStyle = '#ffaa88';
        ctx.fillText(`Кинет.: ${ke.toFixed(1)} Дж`, canvas.width-270, 55);
        ctx.fillText(`Потенц.: ${pe.toFixed(1)} Дж`, canvas.width-270, 75);
        ctx.fillStyle = '#88ff88';
        ctx.fillText(`Полная: ${(ke+pe).toFixed(1)} Дж`, canvas.width-270, 95);
        ctx.fillStyle = '#88aaff';
        ctx.fillText(`Длина: ${pendulumData.length} см`, canvas.width-270, 120);
        ctx.fillText(`Масса: ${pendulumData.mass} кг`, canvas.width-270, 140);
        ctx.fillText(`Скорость: ${v.toFixed(1)} м/с`, canvas.width-270, 160);
        ctx.fillText(`Угол: ${(pendulumData.angle*57.3).toFixed(0)}°`, canvas.width-270, 180);
        
        ctx.fillStyle = '#88aaff';
        ctx.font = '11px monospace';
        ctx.fillText('ДЛИНА', canvas.width-260, 205);
        ctx.fillStyle = '#88ff88';
        ctx.fillRect(canvas.width-245, 208, 20, 16);
        ctx.fillStyle = '#ff8888';
        ctx.fillRect(canvas.width-220, 208, 20, 16);
        ctx.fillStyle = 'black';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('+', canvas.width-239, 221);
        ctx.fillText('-', canvas.width-214, 221);
        
        ctx.fillStyle = '#88aaff';
        ctx.font = '11px monospace';
        ctx.fillText('МАССА', canvas.width-180, 205);
        ctx.fillStyle = '#88ff88';
        ctx.fillRect(canvas.width-165, 208, 20, 16);
        ctx.fillStyle = '#ff8888';
        ctx.fillRect(canvas.width-140, 208, 20, 16);
        ctx.fillStyle = 'black';
        ctx.fillText('+', canvas.width-159, 221);
        ctx.fillText('-', canvas.width-134, 221);
    }
    
    // ПАНЕЛЬ ЗАМЕДЛЕНИЯ ВРЕМЕНИ (ДВЕ СТРОКИ - УМЕНЬШЕННАЯ)
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(10, canvas.height - 70, 210, 60);
    ctx.strokeStyle = '#ffaa44';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, canvas.height - 70, 210, 60);
    ctx.fillStyle = '#ffaa44';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('⏱️ ЗАМЕДЛЕНИЕ ВРЕМЕНИ', 20, canvas.height - 50);
    
    ctx.fillStyle = '#88ff88';
    ctx.font = '9px monospace';
    // Первая строка: 1x - 5x
    ctx.fillText('1x', 25, canvas.height - 38);
    ctx.fillText('2x', 65, canvas.height - 38);
    ctx.fillText('3x', 105, canvas.height - 38);
    ctx.fillText('4x', 145, canvas.height - 38);
    ctx.fillText('5x', 185, canvas.height - 38);
    // Вторая строка: 6x - 10x
    ctx.fillText('6x', 25, canvas.height - 22);
    ctx.fillText('7x', 65, canvas.height - 22);
    ctx.fillText('8x', 105, canvas.height - 22);
    ctx.fillText('9x', 145, canvas.height - 22);
    ctx.fillText('10x', 185, canvas.height - 22);
    
    // Рамки для кнопок первой строки
    for (let i = 0; i < 5; i++) {
        ctx.strokeRect(20 + i * 40, canvas.height - 48, 30, 18);
    }
    // Рамки для кнопок второй строки
    for (let i = 0; i < 5; i++) {
        ctx.strokeRect(20 + i * 40, canvas.height - 32, 30, 18);
    }
}

function drawOptics() {
    ctx.fillStyle = '#ffff88';
    ctx.beginPath();
    ctx.arc(opticsData.lightSource.x, opticsData.lightSource.y, 14, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.fillText('💡', opticsData.lightSource.x-6, opticsData.lightSource.y+5);
    ctx.fillStyle = '#ffff88';
    ctx.font = '9px monospace';
    ctx.fillText('источник', opticsData.lightSource.x-18, opticsData.lightSource.y-12);
    
    ctx.beginPath();
    ctx.ellipse(opticsData.lens.x, opticsData.lens.y, 22, 50, 0, 0, Math.PI*2);
    ctx.strokeStyle = '#88aaff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#88aaff33';
    ctx.fill();
    ctx.fillStyle = '#88aaff';
    ctx.font = '9px monospace';
    ctx.fillText(opticsData.lens.type === 'converging' ? 'собирающая' : 'рассеивающая', opticsData.lens.x-25, opticsData.lens.y-35);
    
    ctx.beginPath();
    ctx.setLineDash([5, 5]);
    ctx.moveTo(opticsData.lens.x, opticsData.lens.y - 55);
    ctx.lineTo(opticsData.lens.x, opticsData.lens.y + 55);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#aaaaff';
    ctx.fillRect(opticsData.mirror.x-8, opticsData.mirror.y-40, 16, 80);
    ctx.fillStyle = 'white';
    ctx.font = '9px monospace';
    ctx.fillText('зеркало', opticsData.mirror.x-17, opticsData.mirror.y-45);
    
    if (opticsData.ray) {
        for (let seg of opticsData.ray.segments) {
            ctx.beginPath();
            ctx.moveTo(seg.x, seg.y);
            ctx.lineTo(seg.toX, seg.toY);
            ctx.strokeStyle = '#ffaa44';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            let midX = (seg.x + seg.toX) / 2, midY = (seg.y + seg.toY) / 2;
            let angle = Math.atan2(seg.toY - seg.y, seg.toX - seg.x);
            ctx.beginPath();
            ctx.moveTo(midX, midY);
            ctx.lineTo(midX - 5 * Math.cos(angle - 0.5), midY - 5 * Math.sin(angle - 0.5));
            ctx.lineTo(midX - 5 * Math.cos(angle + 0.5), midY - 5 * Math.sin(angle + 0.5));
            ctx.fillStyle = '#ffaa44';
            ctx.fill();
        }
        if (opticsData.ray.incidentAngle !== undefined) {
            ctx.fillStyle = '#aaaaff';
            ctx.font = '10px monospace';
            ctx.fillText(`Угол падения: ${opticsData.ray.incidentAngle}°`, opticsData.lens.x - 55, opticsData.lens.y - 25);
            ctx.fillText(`Угол преломления: ${opticsData.ray.refractionAngle}°`, opticsData.lens.x - 55, opticsData.lens.y - 12);
        }
    }
    
    ctx.fillStyle = '#0a0f1acc';
    ctx.fillRect(10, 10, 260, 170);
    ctx.strokeStyle = 'white';
    ctx.strokeRect(10, 10, 260, 170);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('⚙️ ОПТИКА', 20, 30);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#88ff88';
    ctx.fillText(`Линза: ${opticsData.lens.type === 'converging' ? 'собирающая' : 'рассеивающая'}`, 20, 55);
    ctx.fillText(`Угол падения: ${opticsData.incidentAngle}°`, 20, 75);
    ctx.fillStyle = '#ffaa44';
    ctx.fillText('[⬆️] +1°  угол', 20, 100);
    ctx.fillText('[⬇️] -1°  угол', 20, 120);
    ctx.fillText('[🔄] смена линзы', 20, 140);
}

function drawElectricity() {
    ctx.fillStyle = '#888888';
    ctx.fillRect(circuitData.battery.x-30, circuitData.battery.y-22, 60, 44);
    ctx.fillStyle = 'black';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('+', circuitData.battery.x-38, circuitData.battery.y+4);
    ctx.fillText('-', circuitData.battery.x+28, circuitData.battery.y+4);
    ctx.fillStyle = 'white';
    ctx.font = '11px monospace';
    ctx.fillText(`${circuitData.battery.voltage.toFixed(1)}В`, circuitData.battery.x-15, circuitData.battery.y-28);
    
    ctx.fillStyle = '#ffaa44';
    ctx.beginPath();
    ctx.arc(circuitData.battery.positive.x, circuitData.battery.positive.y, 8, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('+', circuitData.battery.positive.x-5, circuitData.battery.positive.y+5);
    ctx.fillStyle = '#ffaa44';
    ctx.beginPath();
    ctx.arc(circuitData.battery.negative.x, circuitData.battery.negative.y, 8, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.fillText('-', circuitData.battery.negative.x-4, circuitData.battery.negative.y+5);
    
    for (let w of circuitData.wires) {
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        ctx.lineTo(w.x2, w.y2);
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = 4;
        ctx.stroke();
    }
    
    if (isDrawingWire && wireStartPoint) {
        ctx.beginPath();
        ctx.moveTo(wireStartPoint.x, wireStartPoint.y);
        ctx.lineTo(tempWire.x, tempWire.y);
        ctx.strokeStyle = '#ffff88';
        ctx.lineWidth = 4;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    for (let i = 0; i < circuitData.components.length; i++) {
        let comp = circuitData.components[i];
        
        ctx.fillStyle = '#88aaff';
        ctx.beginPath();
        ctx.arc(comp.x - 20, comp.y, 7, 0, Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(comp.x + 20, comp.y, 7, 0, Math.PI*2);
        ctx.fill();
        
        ctx.fillStyle = '#0a0f1a';
        ctx.fillRect(comp.x-20, comp.y-18, 40, 36);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(comp.x-20, comp.y-18, 40, 36);
        
        if (comp.type === 'lamp') {
            ctx.fillStyle = comp.on ? '#ffff88' : '#886600';
            ctx.beginPath();
            ctx.arc(comp.x, comp.y, 15, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = comp.on ? 'orange' : 'white';
            ctx.font = 'bold 16px monospace';
            ctx.fillText('💡', comp.x-7, comp.y+6);
        } else if (comp.type === 'resistor') {
            ctx.fillStyle = '#8866aa';
            ctx.fillRect(comp.x-15, comp.y-8, 30, 16);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px monospace';
            ctx.fillText(`${comp.resistance}Ω`, comp.x-10, comp.y+5);
        } else if (comp.type === 'ammeter') {
            ctx.fillStyle = '#4488aa';
            ctx.fillRect(comp.x-18, comp.y-12, 36, 24);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 11px monospace';
            ctx.fillText(`A:${comp.current?.toFixed(2) || 0}`, comp.x-17, comp.y+5);
        } else if (comp.type === 'voltmeter') {
            ctx.fillStyle = '#44aa88';
            ctx.fillRect(comp.x-18, comp.y-12, 36, 24);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 11px monospace';
            ctx.fillText(`V:${comp.voltage?.toFixed(1) || 0}`, comp.x-17, comp.y+5);
        }
        
        ctx.fillStyle = '#aaaaff';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`${i+1}`, comp.x-24, comp.y-14);
    }
    
    if (circuitData.isCircuitClosed && circuitData.current > 0.03) {
        let path = [{ x: circuitData.battery.positive.x, y: circuitData.battery.positive.y }];
        for (let comp of circuitData.components) {
            path.push({ x: comp.x - 20, y: comp.y });
            path.push({ x: comp.x + 20, y: comp.y });
        }
        path.push({ x: circuitData.battery.negative.x, y: circuitData.battery.negative.y });
        for (let e of circuitData.electrons) {
            let idx = Math.floor(e.pos) % path.length;
            if (idx < path.length) {
                ctx.fillStyle = '#ffff00';
                ctx.beginPath();
                ctx.arc(path[idx].x, path[idx].y, 5, 0, Math.PI*2);
                ctx.fill();
            }
        }
    }
    
    ctx.fillStyle = '#0a0f1acc';
    ctx.fillRect(10, 10, 340, 460);
    ctx.strokeStyle = 'white';
    ctx.strokeRect(10, 10, 340, 460);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('⚡ КОНСТРУКТОР ЦЕПЕЙ', 20, 30);
    ctx.font = '10px monospace';
    
    let totalResistance = circuitData.components.filter(c => c.type === 'lamp' || c.type === 'resistor').reduce((s,c) => s + (c.resistance || 0), 0);
    if (totalResistance === 0) totalResistance = 0.1;
    
    ctx.fillStyle = circuitData.isCircuitClosed ? '#88ff88' : '#ff8888';
    ctx.fillText(`Цепь: ${circuitData.isCircuitClosed ? 'ЗАМКНУТА ✅' : 'РАЗОМКНУТА ❌'}`, 20, 55);
    ctx.fillStyle = '#88ff88';
    ctx.fillText(`Ток: ${circuitData.current.toFixed(2)} А`, 20, 72);
    ctx.fillText(`Напряжение: ${circuitData.battery.voltage.toFixed(1)} В`, 20, 89);
    ctx.fillText(`Сопротивление: ${totalResistance.toFixed(1)} Ω`, 20, 106);
    
    ctx.fillStyle = '#ffaa44';
    ctx.font = '11px monospace';
    ctx.fillText('[💡] лампа', 25, 132);
    ctx.fillText('[R] резистор', 200, 132);
    ctx.fillText('[A] амперметр', 25, 154);
    ctx.fillText('[V] вольтметр', 200, 154);
    ctx.fillText('[🗑️] удалить', 25, 176);
    ctx.fillText('[🧹] очистить', 200, 176);
    ctx.fillText('[⚡] провод', 25, 198);
    
    ctx.fillStyle = '#88aaff';
    ctx.fillText('РЕЖИМ РАСЧЁТА:', 20, 228);
    
    ctx.fillStyle = circuitData.calculationMode === 'voltage' ? '#ffff88' : '#aaaaff';
    ctx.fillText('[U] U = const', 25, 250);
    ctx.fillStyle = circuitData.calculationMode === 'current' ? '#ffff88' : '#aaaaff';
    ctx.fillText('[I] I = const', 25, 270);
    ctx.fillStyle = circuitData.calculationMode === 'resistance' ? '#ffff88' : '#aaaaff';
    ctx.fillText('[R] R = const', 25, 290);
    
    ctx.fillStyle = '#ffaa44';
    ctx.fillText(`Значение: ${circuitData.userValue}`, 20, 320);
    ctx.fillText('[▲] +   [▼] - изменить', 20, 340);
    
    ctx.fillStyle = '#88aaff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('📌 ХАРАКТЕРИСТИКИ КОМПОНЕНТОВ:', 20, 375);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#cccccc';
    ctx.fillText('• Лампа — сопротивление 100 Ω', 25, 395);
    ctx.fillText('• Резистор — сопротивление 50 Ω', 25, 412);
    ctx.fillText('• Амперметр — измеряет ток (≈0 Ω)', 25, 429);
    ctx.fillText('• Вольтметр — измеряет напряжение', 25, 446);
    ctx.fillText('  (подключается параллельно)', 25, 460);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1e2a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (currentMode === 'mechanics') drawMechanics();
    else if (currentMode === 'optics') drawOptics();
    else if (currentMode === 'electricity') drawElectricity();
    else {
        ctx.fillStyle = 'white';
        ctx.font = '24px monospace';
        ctx.fillText('👆 НАЖМИ НА КНОПКУ РЕЖИМА', canvas.width/2-200, canvas.height/2);
    }
}

// ==================== ОБРАБОТКА КЛИКОВ ====================
function handleCanvasClick(e) {
    let now = Date.now();
    if (now - lastClickTime < 200) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    let canvasX = (clientX - rect.left) * scaleX;
    let canvasY = (clientY - rect.top) * scaleY;
    
    if (currentMode === 'mechanics') {
        // Панель замедления (две строки - уменьшенная)
        if (canvasX > 10 && canvasX < 430 && canvasY > canvas.height - 80 && canvasY < canvas.height - 10) {
            // Первая строка (1x - 5x)
            if (canvasY > canvas.height - 48 && canvasY < canvas.height - 30) {
                for (let i = 0; i < 5; i++) {
                    let btnX = 20 + i * 40;
                    if (canvasX > btnX && canvasX < btnX + 30) {
                        timeScale = i + 1;
                        info.innerText = `⏱️ Скорость: ${timeScale}x`;
                        lastClickTime = now;
                        return;
                    }
                }
            }
            // Вторая строка (6x - 10x)
            if (canvasY > canvas.height - 32 && canvasY < canvas.height - 14) {
                for (let i = 0; i < 5; i++) {
                    let btnX = 20 + i * 40;
                    if (canvasX > btnX && canvasX < btnX + 30) {
                        timeScale = i + 6;
                        info.innerText = `⏱️ Скорость: ${timeScale}x`;
                        lastClickTime = now;
                        return;
                    }
                }
            }
        }
        
        if (mechanicsType === 'balls') {
            for (let i = 0; i < balls.length; i++) {
                if (Math.hypot(canvasX - balls[i].x, canvasY - balls[i].y) < balls[i].radius) {
                    selectedBallIndex = i;
                    info.innerText = `Выбран шар ${i+1}, масса ${balls[i].mass.toFixed(1)} кг`;
                    lastClickTime = now;
                    return;
                }
            }
            if (canvasX > canvas.width-200 && canvasX < canvas.width-170 && canvasY > 155 && canvasY < 177) {
                balls[selectedBallIndex].mass += 0.1;
                info.innerText = `Масса: ${balls[selectedBallIndex].mass.toFixed(1)} кг`;
                lastClickTime = now;
                return;
            }
            if (canvasX > canvas.width-155 && canvasX < canvas.width-125 && canvasY > 155 && canvasY < 177) {
                balls[selectedBallIndex].mass = Math.max(0.1, balls[selectedBallIndex].mass - 0.1);
                info.innerText = `Масса: ${balls[selectedBallIndex].mass.toFixed(1)} кг`;
                lastClickTime = now;
                return;
            }
        }
        else if (mechanicsType === 'spring') {
            if (canvasX > canvas.width-245 && canvasX < canvas.width-225 && canvasY > 208 && canvasY < 224) {
                springData.stiffness += 0.005;
                info.innerText = `Жёсткость: ${springData.stiffness.toFixed(3)}`;
                lastClickTime = now;
                return;
            }
            if (canvasX > canvas.width-220 && canvasX < canvas.width-200 && canvasY > 208 && canvasY < 224) {
                springData.stiffness = Math.max(0.005, springData.stiffness - 0.005);
                info.innerText = `Жёсткость: ${springData.stiffness.toFixed(3)}`;
                lastClickTime = now;
                return;
            }
            if (canvasX > canvas.width-165 && canvasX < canvas.width-145 && canvasY > 208 && canvasY < 224) {
                springData.mass += 0.1;
                info.innerText = `Масса: ${springData.mass.toFixed(1)} кг`;
                lastClickTime = now;
                return;
            }
            if (canvasX > canvas.width-140 && canvasX < canvas.width-120 && canvasY > 208 && canvasY < 224) {
                springData.mass = Math.max(0.1, springData.mass - 0.1);
                info.innerText = `Масса: ${springData.mass.toFixed(1)} кг`;
                lastClickTime = now;
                return;
            }
        }
        else if (mechanicsType === 'pendulum') {
            if (canvasX > canvas.width-245 && canvasX < canvas.width-225 && canvasY > 208 && canvasY < 224) {
                pendulumData.length = Math.min(250, pendulumData.length + 10);
                info.innerText = `Длина: ${pendulumData.length} см`;
                lastClickTime = now;
                return;
            }
            if (canvasX > canvas.width-220 && canvasX < canvas.width-200 && canvasY > 208 && canvasY < 224) {
                pendulumData.length = Math.max(50, pendulumData.length - 10);
                info.innerText = `Длина: ${pendulumData.length} см`;
                lastClickTime = now;
                return;
            }
            if (canvasX > canvas.width-165 && canvasX < canvas.width-145 && canvasY > 208 && canvasY < 224) {
                pendulumData.mass += 0.1;
                info.innerText = `Масса: ${pendulumData.mass.toFixed(1)} кг`;
                lastClickTime = now;
                return;
            }
            if (canvasX > canvas.width-140 && canvasX < canvas.width-120 && canvasY > 208 && canvasY < 224) {
                pendulumData.mass = Math.max(0.1, pendulumData.mass - 0.1);
                info.innerText = `Масса: ${pendulumData.mass.toFixed(1)} кг`;
                lastClickTime = now;
                return;
            }
        }
    }
    else if (currentMode === 'optics') {
        if (canvasX > 10 && canvasX < 270 && canvasY > 10 && canvasY < 170) {
            let relX = canvasX - 10, relY = canvasY - 10;
            if (relY > 90 && relY < 110 && relX > 20 && relX < 80) {
                opticsData.incidentAngle = Math.min(85, opticsData.incidentAngle + 1);
                generateRay();
                info.innerText = `Угол падения: ${opticsData.incidentAngle}°`;
                lastClickTime = now;
                return;
            }
            if (relY > 110 && relY < 130 && relX > 20 && relX < 80) {
                opticsData.incidentAngle = Math.max(-85, opticsData.incidentAngle - 1);
                generateRay();
                info.innerText = `Угол падения: ${opticsData.incidentAngle}°`;
                lastClickTime = now;
                return;
            }
            if (relY > 130 && relY < 150 && relX > 20 && relX < 80) {
                opticsData.lens.type = opticsData.lens.type === 'converging' ? 'diverging' : 'converging';
                generateRay();
                info.innerText = `Линза: ${opticsData.lens.type === 'converging' ? 'собирающая' : 'рассеивающая'}`;
                lastClickTime = now;
                return;
            }
        }
    }
    else if (currentMode === 'electricity') {
        if (canvasX > 10 && canvasX < 350 && canvasY > 10 && canvasY < 480) {
            let relX = canvasX - 10;
            let relY = canvasY - 10;

            // ЛАМПА
            if (relY > 120 && relY < 145 && relX > 20 && relX < 100) {
                addComponent('lamp');
                lastClickTime = now;
                return;
            }
            // РЕЗИСТОР
            if (relY > 120 && relY < 145 && relX > 190 && relX < 270) {
                addComponent('resistor');
                lastClickTime = now;
                return;
            }
            // АМПЕРМЕТР
            if (relY > 145 && relY < 170 && relX > 20 && relX < 100) {
                addComponent('ammeter');
                lastClickTime = now;
                return;
            }
            // ВОЛЬТМЕТР
            if (relY > 145 && relY < 170 && relX > 190 && relX < 270) {
                addComponent('voltmeter');
                lastClickTime = now;
                return;
            }
            // УДАЛИТЬ
            if (relY > 170 && relY < 195 && relX > 20 && relX < 100) {
                deleteLastComponent();
                lastClickTime = now;
                return;
            }
            // ОЧИСТИТЬ
            if (relY > 170 && relY < 195 && relX > 190 && relX < 270) {
                clearAll();
                lastClickTime = now;
                return;
            }
            // ПРОВОД
            if (relY > 195 && relY < 220 && relX > 20 && relX < 100) {
                isDrawingWire = true;
                wireStartPoint = null;
                info.innerText = 'Режим провода: нажми на первую точку';
                lastClickTime = now;
                return;
            }
            
            // РЕЖИМЫ РАСЧЁТА
            if (relY > 240 && relY < 260 && relX > 20 && relX < 100) {
                circuitData.calculationMode = 'voltage';
                circuitData.userValue = circuitData.battery.voltage;
                info.innerText = 'Режим: U = const';
                lastClickTime = now;
                calculateCircuit();
                return;
            }
            if (relY > 260 && relY < 280 && relX > 20 && relX < 100) {
                circuitData.calculationMode = 'current';
                circuitData.userValue = circuitData.current;
                info.innerText = 'Режим: I = const';
                lastClickTime = now;
                calculateCircuit();
                return;
            }
            if (relY > 280 && relY < 300 && relX > 20 && relX < 100) {
                circuitData.calculationMode = 'resistance';
                circuitData.userValue = totalResistance;
                info.innerText = 'Режим: R = const';
                lastClickTime = now;
                calculateCircuit();
                return;
            }
            
            // ИЗМЕНЕНИЕ ЗНАЧЕНИЯ
            if (relY > 310 && relY < 335 && relX > 20 && relX < 100) {
                if (relX > 20 && relX < 60) {
                    if (circuitData.calculationMode === 'voltage') circuitData.userValue += 1;
                    else if (circuitData.calculationMode === 'current') circuitData.userValue += 0.1;
                    else circuitData.userValue += 10;
                    calculateCircuit();
                    info.innerText = `Значение: ${circuitData.userValue}`;
                    lastClickTime = now;
                    return;
                }
                if (relX > 70 && relX < 100) {
                    if (circuitData.calculationMode === 'voltage') circuitData.userValue = Math.max(1, circuitData.userValue - 1);
                    else if (circuitData.calculationMode === 'current') circuitData.userValue = Math.max(0.1, circuitData.userValue - 0.1);
                    else circuitData.userValue = Math.max(10, circuitData.userValue - 10);
                    calculateCircuit();
                    info.innerText = `Значение: ${circuitData.userValue}`;
                    lastClickTime = now;
                    return;
                }
            }
        }
        
        if (isDrawingWire) {
            if (!wireStartPoint) {
                wireStartPoint = { x: canvasX, y: canvasY };
                tempWire = { x: canvasX, y: canvasY };
                info.innerText = 'Выбери вторую точку провода';
            } else {
                addWire(wireStartPoint.x, wireStartPoint.y, canvasX, canvasY);
                isDrawingWire = false;
                wireStartPoint = null;
                tempWire = null;
            }
            lastClickTime = now;
            return;
        }
        
        for (let comp of circuitData.components) {
            if (Math.abs(canvasX - comp.x) < 25 && Math.abs(canvasY - comp.y) < 25) {
                draggingComponent = comp;
                lastClickTime = now;
                return;
            }
        }
    }
}

// ==================== ПЕРЕТАСКИВАНИЕ ====================
function handleDragStart(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    let canvasX = (clientX - rect.left) * scaleX;
    let canvasY = (clientY - rect.top) * scaleY;
    
    if (currentMode === 'mechanics') {
        if (mechanicsType === 'balls') {
            for (let ball of balls) {
                if (Math.hypot(canvasX - ball.x, canvasY - ball.y) < ball.radius) {
                    draggingBall = ball;
                    return;
                }
            }
        } else if (mechanicsType === 'spring') {
            let bottomY = 100 + springData.length;
            if (Math.hypot(canvasX - springData.x, canvasY - bottomY) < 25) {
                springData.dragging = true;
                return;
            }
        } else if (mechanicsType === 'pendulum') {
            let bobX = pendulumData.x + Math.sin(pendulumData.angle) * pendulumData.length;
            let bobY = pendulumData.y + Math.cos(pendulumData.angle) * pendulumData.length;
            if (Math.hypot(canvasX - bobX, canvasY - bobY) < 20) {
                pendulumData.dragging = true;
                return;
            }
        }
    } else if (currentMode === 'optics') {
        if (Math.hypot(canvasX - opticsData.lightSource.x, canvasY - opticsData.lightSource.y) < 20) draggingOpticsItem = 'source';
        if (Math.hypot(canvasX - opticsData.lens.x, canvasY - opticsData.lens.y) < 50) draggingOpticsItem = 'lens';
        if (Math.abs(canvasX - opticsData.mirror.x) < 20 && Math.abs(canvasY - opticsData.mirror.y) < 55) draggingOpticsItem = 'mirror';
    } else if (currentMode === 'electricity') {
        if (draggingComponent) return;
        for (let comp of circuitData.components) {
            if (Math.abs(canvasX - comp.x) < 25 && Math.abs(canvasY - comp.y) < 25) {
                draggingComponent = comp;
                return;
            }
        }
    }
}

function handleDragMove(e) {
    if (!draggingBall && !springData.dragging && !pendulumData.dragging && !draggingOpticsItem && !draggingComponent) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    let canvasX = (clientX - rect.left) * scaleX;
    let canvasY = (clientY - rect.top) * scaleY;
    
    if (draggingBall) {
        draggingBall.x = Math.min(canvas.width - draggingBall.radius, Math.max(draggingBall.radius, canvasX));
        draggingBall.y = Math.min(canvas.height - draggingBall.radius, Math.max(draggingBall.radius, canvasY));
        draggingBall.vx = 0;
        draggingBall.vy = 0;
    } else if (springData.dragging) {
        let newLength = canvasY - 100;
        springData.length = Math.min(200, Math.max(50, newLength));
        springData.velocity = 0;
    } else if (pendulumData.dragging) {
        let dx = canvasX - pendulumData.x, dy = canvasY - pendulumData.y;
        let newAngle = Math.atan2(dx, dy);
        pendulumData.angle = Math.min(1.5, Math.max(-1.5, newAngle));
        pendulumData.angularVelocity = 0;
    } else if (draggingOpticsItem === 'source') {
        opticsData.lightSource.x = Math.min(canvas.width-20, Math.max(20, canvasX));
        opticsData.lightSource.y = Math.min(canvas.height-20, Math.max(20, canvasY));
        generateRay();
    } else if (draggingOpticsItem === 'lens') {
        opticsData.lens.x = Math.min(canvas.width-40, Math.max(40, canvasX));
        opticsData.lens.y = Math.min(canvas.height-50, Math.max(50, canvasY));
        generateRay();
    } else if (draggingOpticsItem === 'mirror') {
        opticsData.mirror.x = Math.min(canvas.width-20, Math.max(20, canvasX));
        opticsData.mirror.y = Math.min(canvas.height-60, Math.max(60, canvasY));
        generateRay();
    } else if (draggingComponent) {
        draggingComponent.x = Math.min(canvas.width-50, Math.max(50, canvasX));
        draggingComponent.y = Math.min(canvas.height-50, Math.max(50, canvasY));
        calculateCircuit();
    }
}

function handleDragEnd() {
    draggingBall = null;
    springData.dragging = false;
    pendulumData.dragging = false;
    draggingOpticsItem = null;
    draggingComponent = null;
}

// ==================== ПАНЕЛЬ ТИПА МЕХАНИКИ ====================
const typePanel = document.createElement('div');
typePanel.style.position = 'fixed';
typePanel.style.left = '20px';
typePanel.style.top = '150px';
typePanel.style.backgroundColor = '#0a0f1a';
typePanel.style.border = '1px solid white';
typePanel.style.padding = '10px';
typePanel.style.borderRadius = '10px';
typePanel.style.zIndex = '1000';
typePanel.style.display = 'none';
typePanel.innerHTML = `
    <div style="color:white; font-size:14px; margin-bottom:8px;">🔧 ТИП МЕХАНИКИ</div>
    <button id="setBalls" style="margin:4px; padding:6px 12px;">⚽ Шары</button>
    <button id="setSpring" style="margin:4px; padding:6px 12px;">🔧 Пружина</button>
    <button id="setPendulum" style="margin:4px; padding:6px 12px;">⏱️ Маятник</button>
`;
document.body.appendChild(typePanel);

function updateMechanicsPanelVisibility() {
    typePanel.style.display = currentMode === 'mechanics' ? 'block' : 'none';
}

// ==================== КНОПКИ РЕЖИМОВ ====================
document.getElementById('mechBtn').onclick = () => {
    currentMode = 'mechanics';
    updateMechanicsPanelVisibility();
    info.innerText = '🔬 МЕХАНИКА: выбери тип в левой панели';
};
document.getElementById('opticsBtn').onclick = () => {
    currentMode = 'optics';
    updateMechanicsPanelVisibility();
    generateRay();
    info.innerText = '🔆 ОПТИКА: меняй угол падения, тип линзы';
};
document.getElementById('elecBtn').onclick = () => {
    currentMode = 'electricity';
    updateMechanicsPanelVisibility();
    calculateCircuit();
    info.innerText = '⚡ ЭЛЕКТРИЧЕСТВО: выбери режим, добавляй компоненты, соединяй проводами';
};

document.getElementById('setBalls').onclick = () => { mechanicsType = 'balls'; info.innerText = 'Режим: шары'; };
document.getElementById('setSpring').onclick = () => { mechanicsType = 'spring'; info.innerText = 'Режим: пружина'; };
document.getElementById('setPendulum').onclick = () => { mechanicsType = 'pendulum'; info.innerText = 'Режим: маятник'; };

// ==================== КНОПКИ СОХРАНЕНИЯ (В ЛЕВОМ ВЕРХНЕМ УГЛУ) ====================
const saveBtn = document.createElement('button');
saveBtn.innerText = '💾 СОХРАНИТЬ';
saveBtn.style.position = 'fixed';
saveBtn.style.top = '10px';
saveBtn.style.left = '10px';
saveBtn.style.padding = '4px 8px';
saveBtn.style.zIndex = '1000';
saveBtn.style.backgroundColor = '#0a0f1a';
saveBtn.style.color = 'white';
saveBtn.style.border = '1px solid #ffaa44';
saveBtn.style.borderRadius = '4px';
saveBtn.style.cursor = 'pointer';
saveBtn.style.fontSize = '10px';
saveBtn.onclick = () => {
    const data = { mechanics: { mechanicsType, balls, springData, pendulumData }, optics: opticsData, circuit: circuitData, timeScale: timeScale };
    localStorage.setItem('physicsLab', JSON.stringify(data));
    info.innerText = '✅ Сцена сохранена!';
};
document.body.appendChild(saveBtn);

const loadBtn = document.createElement('button');
loadBtn.innerText = '📂 ЗАГРУЗИТЬ';
loadBtn.style.position = 'fixed';
loadBtn.style.top = '10px';
loadBtn.style.left = '100px';
loadBtn.style.padding = '4px 8px';
loadBtn.style.zIndex = '1000';
loadBtn.style.backgroundColor = '#0a0f1a';
loadBtn.style.color = 'white';
loadBtn.style.border = '1px solid #88aaff';
loadBtn.style.borderRadius = '4px';
loadBtn.style.cursor = 'pointer';
loadBtn.style.fontSize = '10px';
loadBtn.onclick = () => {
    const data = localStorage.getItem('physicsLab');
    if (data) {
        const loaded = JSON.parse(data);
        mechanicsType = loaded.mechanics.mechanicsType;
        balls = loaded.mechanics.balls;
        springData = loaded.mechanics.springData;
        pendulumData = loaded.mechanics.pendulumData;
        Object.assign(opticsData, loaded.optics);
        Object.assign(circuitData, loaded.circuit);
        if (loaded.timeScale) timeScale = loaded.timeScale;
        generateRay();
        calculateCircuit();
        info.innerText = '📂 Сцена загружена!';
    } else info.innerText = '❌ Нет сохранений';
};
document.body.appendChild(loadBtn);

canvas.addEventListener('touchstart', (e) => { handleCanvasClick(e); handleDragStart(e); });
canvas.addEventListener('touchmove', handleDragMove);
canvas.addEventListener('touchend', handleDragEnd);
canvas.addEventListener('mousedown', (e) => { handleCanvasClick(e); handleDragStart(e); });
window.addEventListener('mousemove', handleDragMove);
window.addEventListener('mouseup', handleDragEnd);

function animate() {
    if (currentMode === 'mechanics') updateMechanics();
    draw();
    requestAnimationFrame(animate);
}

updateMechanicsPanelVisibility();
animate();
generateRay();
calculateCircuit();
draw();