declare module '*.css';

interface Window {
  markdownWeaveAssets: {
    katexModule: string;
    katexCss: string;
    mermaidModule: string;
  };
}
