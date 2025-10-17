import React, { useEffect, useRef } from 'react';

interface MathRendererProps {
  content: string;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderMath = async () => {
      if (!containerRef.current) return;

      try {
        // Check if MathJax is available
        if (typeof window !== 'undefined' && (window as any).MathJax) {
          const MathJax = (window as any).MathJax;
          
          // Set the content first
          containerRef.current.innerHTML = content;
          
          // Then render math
          await MathJax.typesetPromise([containerRef.current]);
        } else {
          // Fallback: just set the content without math rendering
          containerRef.current.innerHTML = content;
        }
      } catch (error) {
        console.warn('MathJax rendering failed:', error);
        // Fallback to plain text
        if (containerRef.current) {
          containerRef.current.textContent = content;
        }
      }
    };

    renderMath();
  }, [content]);

  // Initialize MathJax if not already loaded
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).MathJax) {
      const script = document.createElement('script');
      script.src = 'https://polyfill.io/v3/polyfill.min.js?features=es6';
      document.head.appendChild(script);

      const mathJaxScript = document.createElement('script');
      mathJaxScript.id = 'MathJax-script';
      mathJaxScript.async = true;
      mathJaxScript.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
      
      // Configure MathJax
      (window as any).MathJax = {
        tex: {
          inlineMath: [['$', '$'], ['\\(', '\\)']],
          displayMath: [['$$', '$$'], ['\\[', '\\]']],
          processEscapes: true,
          processEnvironments: true
        },
        options: {
          skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
          ignoreHtmlClass: 'tex2jax_ignore',
          processHtmlClass: 'tex2jax_process'
        },
        startup: {
          typeset: false  // Don't typeset on startup
        }
      };
      
      document.head.appendChild(mathJaxScript);
    }
  }, []);

  return (
    <div 
      ref={containerRef}
      className="math-renderer"
      role="region"
      aria-label="Message content with mathematical notation"
    />
  );
};