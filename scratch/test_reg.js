import regression from 'regression';

// Generate simulated data (e.g. 74 episodes, rating increasing with some noise)
const dataPoints = [];
for (let i = 1; i <= 74; i++) {
    // some curved pattern: e.g. y = 8 + sin(i/10) + noise
    const y = 8 + Math.sin(i / 10) + (Math.sin(i / 5) * 0.5) + (i % 2 === 0 ? 0.2 : -0.2);
    dataPoints.push([i, y]);
}

console.log("=== REGULAR REGRESSION (order 6) ===");
try {
    const result = regression.polynomial(dataPoints, { order: 6, precision: 10 });
    const predictions = dataPoints.map(p => result.predict(p[0])[1]);
    console.log("First 3 predictions:", predictions.slice(0, 3));
    console.log("Last 3 predictions:", predictions.slice(-3));
    console.log("Max predicted value:", Math.max(...predictions));
    console.log("Min predicted value:", Math.min(...predictions));
} catch (e) {
    console.error("Failed regular:", e);
}

console.log("\n=== SCALED REGRESSION (order 6) ===");
try {
    const n = dataPoints.length;
    const scaledDataPoints = dataPoints.map((p, idx) => {
        const scaledX = -1 + 2 * idx / (n - 1);
        return [scaledX, p[1]];
    });
    
    const result = regression.polynomial(scaledDataPoints, { order: 6, precision: 10 });
    const predictions = dataPoints.map((p, idx) => {
        const scaledX = -1 + 2 * idx / (n - 1);
        return result.predict(scaledX)[1];
    });
    console.log("First 3 predictions:", predictions.slice(0, 3));
    console.log("Last 3 predictions:", predictions.slice(-3));
    console.log("Max predicted value:", Math.max(...predictions));
    console.log("Min predicted value:", Math.min(...predictions));
} catch (e) {
    console.error("Failed scaled:", e);
}
