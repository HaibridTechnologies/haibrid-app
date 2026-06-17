import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const htmlToText = require('../lib/htmlToText');

describe('htmlToText', () => {
  it('strips script tags and their content', () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    expect(htmlToText(html)).toBe('Hello\nWorld');
  });

  it('strips style tags and their content', () => {
    const html = '<style>.red { color: red; }</style><p>Visible</p>';
    expect(htmlToText(html)).toBe('Visible');
  });

  it('strips nav, footer, aside, and header tags', () => {
    const html = '<nav>Menu</nav><main><p>Content</p></main><footer>Footer</footer><aside>Sidebar</aside><header>Head</header>';
    expect(htmlToText(html)).toBe('Content');
  });

  it('converts block-level closing tags to newlines', () => {
    const html = '<p>First paragraph</p><p>Second paragraph</p>';
    expect(htmlToText(html)).toBe('First paragraph\nSecond paragraph');
  });

  it('converts br tags to newlines', () => {
    const html = 'Line one<br>Line two<br/>Line three';
    expect(htmlToText(html)).toBe('Line one\nLine two\nLine three');
  });

  it('strips remaining HTML tags', () => {
    const html = '<span class="highlight"><strong>Bold</strong> text</span>';
    expect(htmlToText(html)).toBe('Bold text');
  });

  it('decodes common HTML entities', () => {
    const html = '<p>A &amp; B &lt; C &gt; D &quot;quoted&quot; &#39;tick&#39; &nbsp; end</p>';
    expect(htmlToText(html)).toBe('A & B < C > D "quoted" \'tick\' end');
  });

  it('replaces unknown entities with a space', () => {
    const html = '<p>100&deg;C and &mdash; dash</p>';
    expect(htmlToText(html)).toBe('100 C and dash');
  });

  it('collapses horizontal whitespace', () => {
    const html = '<p>lots    of     space</p>';
    expect(htmlToText(html)).toBe('lots of space');
  });

  it('limits consecutive blank lines to one', () => {
    const html = '<p>A</p><p></p><p></p><p></p><p>B</p>';
    const result = htmlToText(html);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain('A');
    expect(result).toContain('B');
  });

  it('trims leading and trailing whitespace', () => {
    const html = '   <p>   content   </p>   ';
    expect(htmlToText(html)).toBe('content');
  });

  it('handles heading tags as block elements', () => {
    const html = '<h1>Title</h1><h2>Subtitle</h2><p>Body</p>';
    expect(htmlToText(html)).toBe('Title\nSubtitle\nBody');
  });

  it('handles list items as block elements', () => {
    const html = '<ul><li>One</li><li>Two</li><li>Three</li></ul>';
    expect(htmlToText(html)).toBe('One\nTwo\nThree');
  });

  it('handles table rows', () => {
    const html = '<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>';
    expect(htmlToText(html)).toContain('A');
    expect(htmlToText(html)).toContain('B');
  });

  it('returns empty string for empty input', () => {
    expect(htmlToText('')).toBe('');
  });

  it('handles nested scripts correctly', () => {
    const html = '<div><script type="text/javascript">var x = 1;</script><p>Real content</p></div>';
    expect(htmlToText(html)).toBe('Real content');
  });

  it('handles a realistic article page', () => {
    const html = `
      <html>
        <head><style>body { font-size: 14px; }</style></head>
        <body>
          <nav><a href="/">Home</a></nav>
          <header><h1>Site Name</h1></header>
          <article>
            <h1>Article Title</h1>
            <p>First paragraph with <strong>bold</strong> and <em>italic</em>.</p>
            <p>Second paragraph about &amp; operators.</p>
          </article>
          <aside>Related links</aside>
          <footer>Copyright 2026</footer>
          <script>analytics.track();</script>
        </body>
      </html>
    `;
    const result = htmlToText(html);
    expect(result).toContain('Article Title');
    expect(result).toContain('First paragraph with bold and italic.');
    expect(result).toContain('Second paragraph about & operators.');
    expect(result).not.toContain('Home');
    expect(result).not.toContain('Site Name');
    expect(result).not.toContain('Related links');
    expect(result).not.toContain('Copyright');
    expect(result).not.toContain('analytics');
  });
});
