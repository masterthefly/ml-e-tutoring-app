import React, { useEffect, useRef } from 'react';

interface ChartDataPoint {
  x: string;
  y: number;
}

interface LineChartProps {
  data: ChartDataPoint[];
  height?: number;
  'aria-label'?: string;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  height = 200,
  'aria-label': ariaLabel,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const width = rect.width;
    
    // Clear previous content
    svg.innerHTML = '';

    // Set up dimensions and margins
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Find data ranges
    const yValues = data.map(d => d.y);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const yRange = maxY - minY || 1;

    // Create scales
    const xScale = (index: number) => (index / (data.length - 1)) * chartWidth;
    const yScale = (value: number) => chartHeight - ((value - minY) / yRange) * chartHeight;

    // Create main group
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${margin.left},${margin.top})`);
    svg.appendChild(g);

    // Create grid lines
    const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gridGroup.setAttribute('class', 'grid');
    g.appendChild(gridGroup);

    // Horizontal grid lines
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * chartHeight;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', y.toString());
      line.setAttribute('x2', chartWidth.toString());
      line.setAttribute('y2', y.toString());
      line.setAttribute('stroke', 'var(--border-color)');
      line.setAttribute('stroke-width', '1');
      gridGroup.appendChild(line);
    }

    // Create line path
    if (data.length > 1) {
      const pathData = data
        .map((d, i) => {
          const x = xScale(i);
          const y = yScale(d.y);
          return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        })
        .join(' ');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--primary-color)');
      path.setAttribute('stroke-width', '3');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      g.appendChild(path);
    }

    // Create data points
    data.forEach((d, i) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', xScale(i).toString());
      circle.setAttribute('cy', yScale(d.y).toString());
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', 'var(--primary-color)');
      circle.setAttribute('stroke', 'white');
      circle.setAttribute('stroke-width', '2');
      
      // Add title for accessibility
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${d.x}: ${d.y}%`;
      circle.appendChild(title);
      
      g.appendChild(circle);
    });

    // Y-axis labels
    for (let i = 0; i <= 4; i++) {
      const value = minY + (i / 4) * yRange;
      const y = chartHeight - (i / 4) * chartHeight;
      
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '-10');
      text.setAttribute('y', y.toString());
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', '12');
      text.setAttribute('fill', 'var(--text-secondary)');
      text.textContent = Math.round(value).toString();
      g.appendChild(text);
    }

    // X-axis labels (show first, middle, and last)
    const labelIndices = data.length > 2 
      ? [0, Math.floor(data.length / 2), data.length - 1]
      : [0, data.length - 1];

    labelIndices.forEach(i => {
      if (i < data.length) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', xScale(i).toString());
        text.setAttribute('y', (chartHeight + 20).toString());
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '12');
        text.setAttribute('fill', 'var(--text-secondary)');
        text.textContent = data[i].x;
        g.appendChild(text);
      }
    });

  }, [data, height]);

  if (data.length === 0) {
    return (
      <div className="line-chart line-chart--empty" style={{ height }}>
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className="line-chart" style={{ height }}>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        role="img"
        aria-label={ariaLabel || 'Line chart showing data trends'}
      />
    </div>
  );
};