import { LineSegments2 } from '/lib/LineSegments2.js';
import { LineGeometry } from '/lib/LineGeometry.js';
import { LineMaterial } from '/lib/LineMaterial.js';

class Line2 extends LineSegments2 {

	constructor( geometry = new LineGeometry(), material = new LineMaterial( { color: Math.random() * 0xffffff } ) ) {

		super( geometry, material );

		this.isLine2 = true;

		this.type = 'Line2';

	}

}

export { Line2 };
