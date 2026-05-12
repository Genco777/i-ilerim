// ── Shared HTML layout wrapper for all email themes ──

export interface BaseOpts {
  bgColor: string;
  cardBg: string;
  accent: string;
  accentHover: string;
  headingColor: string;
  bodyColor: string;
  mutedColor: string;
  borderColor: string;
  ctaBg: string;
  ctaText: string;
  fontFamily: string;
  content: string;
  unsubscribeUrl?: string;
  privacyUrl?: string;
  imprintUrl?: string;
}

function socialIcon(href: string, svg: string, accent: string): string {
  return `<a href="${href}" target="_blank" style="display:inline-block;width:36px;height:36px;background:${accent};border-radius:50%;text-align:center;line-height:34px;text-decoration:none;margin:0 6px;vertical-align:middle;">${svg}</a>`;
}

// Fly & Froth wordmark logo — navy (#0F1B2D) primary variant
// Paths extracted from CorelDRAW SVG; fills inlined for email client compatibility.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="64" viewBox="0 0 563.85 165.011" style="vertical-align:middle;">
  <path fill="#0F1B2D" d="M121.861 30.701c4.944,-10.056 11.037,-20.586 15.99,-30.701l-120.388 0c-16.568,-0.004 -17.269,1.655 -17.269,23.026 0,13.076 -0.783,90.862 0.802,99.616 1.504,8.312 13.615,15.129 20.557,19.738 3.315,2.202 9.745,7.277 12.54,7.928 0,-11.402 -0.906,-63.722 0.64,-70.357 5.569,-2.673 19.539,-1.279 27.503,-1.279l42.857 0.004c15.419,0.084 14.614,-6.338 23.138,-20.355 7.806,-12.837 7.882,-10.35 -7.152,-10.35 -12.425,0 -84.684,1.023 -86.346,-0.64 -1.492,-3.108 -0.64,-9.822 -0.64,-14.071 5.876,-3.935 8.426,-2.559 19.828,-2.559 22.646,0 45.293,0 67.94,0z"/>
  <path fill="#0F1B2D" d="M50.722 155.425c0,4.659 2.509,8.561 6.65,9.387 8.584,1.712 11.718,-7.999 16.179,-15.98 1.079,-1.931 1.866,-3.328 3.028,-5.287 1.189,-2.004 1.883,-3.506 2.955,-5.36 0.308,-0.534 23.087,-39.887 23.637,-42.244l-52.449 0 0 59.484z"/>
  <path fill="#0F1B2D" d="M297.381 91.246c0,-2.716 0.649,-4.225 4.478,-5.117 1.203,0.882 0.753,0.697 1.663,1.535 0.704,0.65 1.012,0.908 1.684,1.513 1.508,1.358 2.513,1.982 3.049,3.988 -0.017,0.003 -10.874,3.977 -10.874,-1.919zm3.198 -17.909c3.606,-5.385 13.557,-1.603 4.477,4.477 -4.328,-1.156 -4.083,-3.596 -4.477,-4.477zm-8.315 -0.64c0,4.994 2.009,5.584 3.838,8.315 -1.596,2.179 -8.4,4.33 -7.919,11.251 0.632,9.099 10.643,8.577 16.873,8.577 3.416,0 6.613,-1.958 8.955,-3.198 5.448,3.648 3.63,2.558 13.432,2.558 -0.709,-2.656 -1.476,-2.272 -3.303,-3.733 -1.432,-1.145 -2.125,-2.496 -3.093,-3.942 1.823,-2.097 5.475,-6.218 5.756,-9.594l-8.315 0c-0.579,2.485 -1.351,3.88 -3.198,5.117l-4.243 -4.072c-0.962,-0.971 -0.685,-0.447 -1.513,-1.685 3.885,-2.055 8.027,-4.901 7.532,-10.123 -1.089,-11.505 -24.802,-9.382 -24.802,0.529z"/>
  <path fill="#0F1B2D" d="M408.673 82.291l-10.873 0 0 -10.233 10.873 0c9.949,0 9.893,10.233 0,10.233zm-19.828 -16.629c1.461,6.271 0,19.498 0,27.503 0,2.884 0.449,1.886 0.343,4.607 -0.116,2.983 -0.865,2.428 8.612,2.428l0 -10.873 7.035 0c2.446,0 0.233,0.196 1.919,-0.64l7.172 8.818c1.856,1.96 1.728,2.571 4.932,2.744 2.512,0.135 5.759,-0.049 8.364,-0.049 -1.819,-2.716 -9.579,-10.337 -10.234,-12.792 7.768,-1.81 10.927,-14.151 3.604,-19.595 -6.697,-4.978 -31.641,-2.271 -31.747,-2.151z"/>
  <path fill="#0F1B2D" d="M442.572 82.931c0,-15.535 24.305,-13.198 24.305,-1.919 0,3.715 0.13,7.472 -3.912,10.159 -7.389,4.914 -20.393,2.291 -20.393,-8.24zm-8.954 -1.919c0,6.091 1.01,11.573 6.368,15.379 12.995,9.233 35.846,4.013 35.846,-12.821 0,-27.76 -42.214,-22.803 -42.214,-2.558z"/>
  <path fill="#7C8BC4" d="M121.861 30.701c24.463,0 20.082,2.562 32.274,-19.391 1.382,-2.488 5.427,-9.021 5.96,-11.31l-22.244 0c-4.953,10.115 -11.046,20.645 -15.99,30.701z"/>
  <path fill="#0F1B2D" d="M533.396 65.994l-5.407 0.078c-0.969,3.577 -0.601,27.77 -0.343,32.962l7.371 -0.027 -0.041 -13.259c2.799,-1.155 16.793,-0.938 20.387,-0.536 1.784,3.611 0.167,9.554 0.878,13.712l6.881 0.001 -0.036 -33.048 -6.314 -0.215c-0.94,-0.35 0.328,-1.1 -1.629,0l0 12.792 -19.828 0 0 -12.792 -1.919 0.332z"/>
  <path fill="#0F1B2D" d="M347.91 66.941l0 31.341c0,2.67 2.22,1.918 7.676,1.918 2.55,0 1.279,-3.85 1.279,-12.152 2.693,-1.113 15.051,-0.64 18.549,-0.64l0 -6.396 -18.549 0c0,-11.303 -1.783,-7.665 6.323,-8.746 6.498,-0.867 7.587,1.617 15.423,-0.208l0 -7.036 -27.438 0.135c-2.147,0.035 -3.263,-0.403 -3.263,1.784z"/>
  <path fill="#0F1B2D" d="M161.785 65.662l0 34.538c12.739,0 8.315,0.903 8.315,-10.873 0,-3.944 9.989,-1.153 19.188,-1.919l0 -6.396 -19.188 0 0 -7.036c0,-2.011 1.126,-1.787 4.793,-1.676 3.221,0.098 3.946,-0.672 10.098,0.228 7.789,1.14 6.855,-0.407 6.855,-5.587 0,-1.474 -0.445,-1.919 -1.919,-1.919 -10.851,0 -17.651,-0.458 -28.142,0.64z"/>
  <path fill="#0F1B2D" d="M230.862 65.662c1.765,2.636 3.374,4.723 5.392,7.4 1.838,2.437 10.3,12.755 10.613,15.611 1.254,11.454 -4.663,11.527 8.94,11.527 0,-17.523 -1.401,-10.398 8.319,-24.3 1.373,-1.964 2.863,-3.845 4.382,-5.854 0.471,-0.624 0.569,-0.762 1.129,-1.472 0.277,-0.35 1.157,-1.423 1.191,-1.475 1.79,-2.745 0.022,-2.077 -7.346,-2.077 -2.62,0 -11.318,13.981 -11.513,14.711l-1.279 0c-0.515,-1.927 -9.416,-14.711 -10.234,-14.711 -4.254,0 -5.536,0.64 -9.594,0.64z"/>
  <path fill="#0F1B2D" d="M481.588 66.941l0 5.756 13.432 0 0 27.503 8.315 0c0,-32.141 -1.657,-27.423 4.462,-27.704 10.225,-0.47 8.97,2.911 8.97,-7.474l-33.26 0c-1.474,0 -1.919,0.445 -1.919,1.919z"/>
  <path fill="#0F1B2D" d="M202.719 65.662l0 34.538 30.062 0 0 -7.035c-2.827,0 -19.295,0.376 -20.659,-0.34 -0.574,-0.301 -1.087,1.129 -1.087,-1.579l0 -26.224 -8.316 0.64z"/>
  <path fill="#0F1B2D" d="M556.772 65.662l6.314 0.215 0.036 33.048 -6.881 -0.001c-0.711,-4.158 0.906,-10.101 -0.878,-13.712 -3.594,-0.402 -17.588,-0.619 -20.387,0.536l0.041 13.259 -7.371 0.027c-0.258,-5.192 -0.626,-29.385 0.343,-32.962l5.407 -0.078c-1.578,-1.522 -0.763,-0.972 -6.396,-0.972 0,8.966 -0.891,12.698 -0.216,21.433l-0.012 10.882c-0.466,3.597 0.176,2.863 8.543,2.863l0 -14.071c5.17,0 16.159,1.121 19.828,-0.639l0 14.71c1.808,0 4.84,0.195 6.487,0.04 3.133,-0.293 2.1,-0.442 1.881,-3.818l-0.036 -26.981c0.083,-1.766 2.517,-6.69 -6.703,-3.779z"/>
</svg>`;

// White variant for dark backgrounds
const LOGO_SVG_WHITE = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="64" viewBox="0 0 551.21 161.312" style="vertical-align:middle;">
  <path fill="white" d="M119.129 30.013c4.834,-9.83 10.79,-20.124 15.632,-30.013l-117.689 0c-16.197,-0.004 -16.883,1.618 -16.883,22.51 0,12.783 -0.765,88.825 0.784,97.383 1.471,8.126 13.31,14.79 20.097,19.296 3.241,2.152 9.526,7.113 12.258,7.75 0,-11.147 -0.885,-62.294 0.626,-68.78 5.445,-2.613 19.102,-1.251 26.886,-1.251l41.898 0.005c15.073,0.081 14.285,-6.196 22.618,-19.9 7.632,-12.549 7.706,-10.117 -6.991,-10.117 -12.147,0 -82.786,0.999 -84.411,-0.626 -1.458,-3.039 -0.626,-9.602 -0.626,-13.756 5.745,-3.846 8.238,-2.501 19.384,-2.501 22.139,0 44.278,0 66.417,0z"/>
  <path fill="white" d="M49.585 151.941c0,4.554 2.453,8.369 6.501,9.177 8.392,1.673 11.455,-7.82 15.816,-15.623 1.055,-1.887 1.824,-3.252 2.961,-5.168 1.162,-1.959 1.84,-3.427 2.888,-5.24 0.301,-0.522 22.57,-38.993 23.107,-41.296l-51.273 0 0 58.15z"/>
  <path fill="white" d="M290.715 89.2c0,-2.654 0.635,-4.13 4.377,-5.002 1.177,0.862 0.736,0.681 1.626,1.501 0.688,0.635 0.989,0.888 1.647,1.479 1.474,1.327 2.456,1.937 2.98,3.898 -0.016,0.004 -10.63,3.889 -10.63,-1.876zm3.126 -17.507c3.525,-5.264 13.253,-1.567 4.377,4.377 -4.231,-1.13 -3.992,-3.515 -4.377,-4.377zm-8.128 -0.625c0,4.881 1.963,5.458 3.751,8.128 -1.56,2.13 -8.211,4.233 -7.741,10.999 0.618,8.894 10.404,8.384 16.495,8.384 3.34,0 6.464,-1.914 8.754,-3.126 5.326,3.566 3.549,2.501 13.13,2.501 -0.693,-2.597 -1.442,-2.221 -3.228,-3.649 -1.4,-1.12 -2.078,-2.44 -3.024,-3.854 1.782,-2.05 5.353,-6.079 5.627,-9.379l-8.128 0c-0.566,2.429 -1.321,3.793 -3.126,5.002l-4.148 -3.981c-0.942,-0.949 -0.67,-0.436 -1.48,-1.646 3.798,-2.01 7.847,-4.792 7.363,-9.897 -1.065,-11.246 -24.245,-9.172 -24.245,0.518z"/>
  <path fill="white" d="M399.512 80.447l-10.63 0 0 -10.004 10.63 0c9.726,0 9.672,10.004 0,10.004zm-19.383 -16.257c1.428,6.131 0,19.061 0,26.886 0,2.82 0.439,1.844 0.335,4.504 -0.113,2.916 -0.846,2.374 8.418,2.374l0 -10.629 6.878 0c2.391,0 0.228,0.192 1.876,-0.626l7.012 8.621c1.813,1.915 1.688,2.513 4.82,2.682 2.457,0.132 5.63,-0.048 8.177,-0.048 -1.778,-2.655 -9.364,-10.106 -10.005,-12.505 7.594,-1.769 10.683,-13.834 3.524,-19.156 -6.547,-4.867 -30.932,-2.22 -31.035,-2.103z"/>
  <path fill="white" d="M432.651 81.072c0,-15.186 23.76,-12.902 23.76,-1.876 0,3.632 0.127,7.305 -3.824,9.932 -7.224,4.803 -19.936,2.239 -19.936,-8.056zm-8.754 -1.876c0,5.955 0.988,11.314 6.225,15.035 12.704,9.025 35.043,3.922 35.043,-12.534 0,-27.138 -41.268,-22.292 -41.268,-2.501z"/>
  <path fill="#7C8BC4" d="M119.129 30.013c23.915,0 19.632,2.505 31.551,-18.957 1.351,-2.432 5.305,-8.818 5.827,-11.056l-21.746 0c-4.842,9.889 -10.798,20.183 -15.632,30.013z"/>
  <path fill="white" d="M521.439 64.514l-5.285 0.077c-0.948,3.497 -0.588,27.147 -0.336,32.223l7.206 -0.026 -0.04 -12.962c2.736,-1.13 16.416,-0.917 19.93,-0.524 1.743,3.53 0.162,9.34 0.858,13.405l6.727 0 -0.036 -32.307 -6.172 -0.21c-0.919,-0.342 0.32,-1.075 -1.592,0l0 12.505 -19.384 0 0 -12.505 -1.876 0.324z"/>
  <path fill="white" d="M340.111 65.44l0 30.639c0,2.61 2.17,1.875 7.503,1.875 2.494,0 1.251,-3.764 1.251,-11.88 2.633,-1.088 14.714,-0.625 18.133,-0.625l0 -6.253 -18.133 0c0,-11.049 -1.743,-7.493 6.181,-8.55 6.353,-0.847 7.418,1.581 15.078,-0.203l0 -6.879 -26.823 0.132c-2.099,0.035 -3.19,-0.393 -3.19,1.744z"/>
  <path fill="white" d="M158.158 64.19l0 33.764c12.453,0 8.128,0.882 8.128,-10.629 0,-3.856 9.766,-1.128 18.758,-1.876l0 -6.253 -18.758 0 0 -6.878c0,-1.966 1.102,-1.747 4.686,-1.638 3.15,0.095 3.858,-0.658 9.872,0.222 7.615,1.115 6.702,-0.398 6.702,-5.462 0,-1.441 -0.436,-1.876 -1.876,-1.876 -10.608,0 -17.256,-0.447 -27.512,0.626z"/>
  <path fill="white" d="M225.687 64.19c1.726,2.577 3.298,4.618 5.271,7.234 1.797,2.383 10.069,12.469 10.375,15.262 1.226,11.197 -4.559,11.268 8.74,11.268 0,-17.13 -1.37,-10.165 8.132,-23.756 1.343,-1.92 2.799,-3.759 4.284,-5.722 0.461,-0.61 0.556,-0.745 1.104,-1.439 0.271,-0.342 1.131,-1.392 1.164,-1.442 1.75,-2.684 0.022,-2.031 -7.181,-2.031 -2.562,0 -11.064,13.668 -11.255,14.381l-1.251 0c-0.503,-1.883 -9.205,-14.381 -10.004,-14.381 -4.159,0 -5.412,0.626 -9.379,0.626z"/>
  <path fill="white" d="M470.792 65.44l0 5.628 13.131 0 0 26.886 8.129 0c0,-31.421 -1.62,-26.809 4.362,-27.083 9.996,-0.46 8.768,2.845 8.768,-7.307l-32.514 0c-1.44,0 -1.876,0.435 -1.876,1.876z"/>
  <path fill="white" d="M198.175 64.19l0 33.764 29.388 0 0 -6.878c-2.764,0 -18.863,0.368 -20.196,-0.331 -0.561,-0.295 -1.063,1.103 -1.063,-1.545l0 -25.636 -8.129 0.626z"/>
  <path fill="white" d="M544.291 64.19l6.172 0.21 0.036 32.307 -6.727 0c-0.696,-4.065 0.885,-9.875 -0.858,-13.405 -3.514,-0.393 -17.194,-0.606 -19.93,0.524l0.04 12.962 -7.206 0.026c-0.252,-5.076 -0.612,-28.726 0.336,-32.223l5.285 -0.077c-1.542,-1.487 -0.746,-0.95 -6.252,-0.95 0,8.765 -0.872,12.414 -0.212,20.953l-0.012 10.638c-0.455,3.516 0.173,2.799 8.352,2.799l0 -13.756c5.055,0 15.796,1.096 19.384,-0.625l0 14.381c1.767,0 4.731,0.19 6.341,0.039 3.063,-0.287 2.053,-0.432 1.839,-3.732l-0.036 -26.377c0.082,-1.726 2.461,-6.539 -6.552,-3.694z"/>
</svg>`;

const INSTAGRAM_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-top:-1px;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.5"/></svg>`;

const LINKEDIN_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-top:-1px;"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>`;

const GLOBE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-top:-1px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

const MAP_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-top:-1px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

export function baseLayout(opts: BaseOpts): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:${opts.bgColor};font-family:${opts.fontFamily};">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${opts.bgColor};padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:${opts.cardBg};border-radius:12px;overflow:hidden;border:1px solid ${opts.borderColor};">

  <!-- Header with Logo -->
  <tr><td style="padding:36px 40px 24px;text-align:center;">
    <div style="margin-bottom:8px;">
      ${LOGO_SVG}
    </div>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.22em;margin:6px 0 0;">Grafik- &amp; Webdesign Studio &middot; Karben, Rhein-Main</p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 40px;">
    <div style="height:1px;background:linear-gradient(to right,transparent,${opts.accent}40,transparent);"></div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:30px 40px;">
    ${opts.content}
  </td></tr>

  <!-- USP Bar -->
  <tr><td style="padding:16px 40px 0;">
    <div style="height:1px;background:linear-gradient(to right,transparent,${opts.accent}30,transparent);margin-bottom:16px;"></div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:12px 8px;background:${opts.bgColor};border-radius:8px;border:1px solid ${opts.borderColor};width:33%;">
          <p style="color:${opts.accent};font-family:${opts.fontFamily};font-size:20px;font-weight:800;margin:0;">1000+</p>
          <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;margin:2px 0 0;">Projekte</p>
        </td>
        <td width="12"></td>
        <td align="center" style="padding:12px 8px;background:${opts.bgColor};border-radius:8px;border:1px solid ${opts.borderColor};width:33%;">
          <p style="color:${opts.accent};font-family:${opts.fontFamily};font-size:20px;font-weight:800;margin:0;">5.0</p>
          <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;margin:2px 0 0;">Google ★</p>
        </td>
        <td width="12"></td>
        <td align="center" style="padding:12px 8px;background:${opts.bgColor};border-radius:8px;border:1px solid ${opts.borderColor};width:33%;">
          <p style="color:${opts.accent};font-family:${opts.fontFamily};font-size:20px;font-weight:800;margin:0;">24h</p>
          <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;margin:2px 0 0;">Express</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:18px 40px 0;">
    <div style="height:1px;background:linear-gradient(to right,transparent,${opts.accent}30,transparent);"></div>
  </td></tr>

  <!-- Social + Footer -->
  <tr><td style="padding:22px 40px 32px;text-align:center;">
    <table cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 16px;">
      <tr>
        <td>${socialIcon('https://fly-froth.com', GLOBE_SVG, opts.accent)}</td>
        <td>${socialIcon('https://www.instagram.com/fly.froth', INSTAGRAM_SVG, opts.accent)}</td>
        <td>${socialIcon('https://www.linkedin.com/company/fly-froth', LINKEDIN_SVG, opts.accent)}</td>
        <td>${socialIcon('https://maps.google.com/?q=Fly+Froth+Karben', MAP_SVG, opts.accent)}</td>
      </tr>
    </table>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:12px;margin:0 0 4px;">
      Fly &amp; Froth &middot; R&ouml;derweg 19 &middot; 61184 Karben
    </p>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;margin:0 0 10px;">
      <a href="https://fly-froth.com" style="color:${opts.accent};text-decoration:none;">fly-froth.com</a> &middot; <a href="mailto:info@fly-froth.com" style="color:${opts.accent};text-decoration:none;">info@fly-froth.com</a> &middot; Tel: +49 163 1474127
    </p>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:10px;margin:0 0 6px;">
      &copy; ${year} Fly &amp; Froth. Alle Rechte vorbehalten.
    </p>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:10px;margin:0;line-height:1.8;">
      ${opts.unsubscribeUrl ? `<a href="${opts.unsubscribeUrl}" style="color:${opts.accent};text-decoration:underline;">Newsletter abbestellen</a>` : ''}${opts.unsubscribeUrl && opts.privacyUrl ? ' &middot; ' : ''}${opts.privacyUrl ? `<a href="${opts.privacyUrl}" style="color:${opts.accent};text-decoration:underline;">Datenschutz</a>` : ''}${(opts.unsubscribeUrl || opts.privacyUrl) && opts.imprintUrl ? ' &middot; ' : ''}${opts.imprintUrl ? `<a href="${opts.imprintUrl}" style="color:${opts.accent};text-decoration:underline;">Impressum</a>` : ''}
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`;
}

/** Typography defaults — all themes use these */
export const TYPO = {
  heading: 'font-weight:800;letter-spacing:-0.025em;',
  body: 'font-weight:300;line-height:1.7;',
  cta: 'font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;',
  eyebrow: 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.22em;',
};
