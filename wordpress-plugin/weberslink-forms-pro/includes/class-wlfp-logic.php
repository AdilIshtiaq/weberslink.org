<?php
defined( 'ABSPATH' ) || exit;

/** Conditional-logic evaluation (mirrors assets/js/form.js). */
class WLFP_Logic {

	public static function operators() {
		return array(
			'eq'           => __( 'is', 'weberslink-forms-pro' ),
			'neq'          => __( 'is not', 'weberslink-forms-pro' ),
			'contains'     => __( 'contains', 'weberslink-forms-pro' ),
			'not_contains' => __( 'does not contain', 'weberslink-forms-pro' ),
			'starts'       => __( 'starts with', 'weberslink-forms-pro' ),
			'ends'         => __( 'ends with', 'weberslink-forms-pro' ),
			'gt'           => __( 'greater than', 'weberslink-forms-pro' ),
			'lt'           => __( 'less than', 'weberslink-forms-pro' ),
			'gte'          => __( 'greater or equal', 'weberslink-forms-pro' ),
			'lte'          => __( 'less or equal', 'weberslink-forms-pro' ),
			'empty'        => __( 'is empty', 'weberslink-forms-pro' ),
			'not_empty'    => __( 'is not empty', 'weberslink-forms-pro' ),
		);
	}

	/** $cond = {enabled, match, rules[]}; $data = name => value. */
	public static function passes( $cond, $data ) {
		if ( empty( $cond['enabled'] ) || empty( $cond['rules'] ) ) {
			return true;
		}
		$any = ( isset( $cond['match'] ) && 'any' === $cond['match'] );
		foreach ( $cond['rules'] as $r ) {
			if ( empty( $r['field'] ) ) {
				continue;
			}
			$ok = self::rule( $r, isset( $data[ $r['field'] ] ) ? $data[ $r['field'] ] : '' );
			if ( $any && $ok ) {
				return true;
			}
			if ( ! $any && ! $ok ) {
				return false;
			}
		}
		return ! $any;
	}

	public static function rule( $r, $actual ) {
		$op  = isset( $r['op'] ) ? $r['op'] : 'eq';
		$exp = isset( $r['value'] ) ? (string) $r['value'] : '';
		$arr = is_array( $actual ) ? array_map( 'strval', self::flatten( $actual ) ) : array( (string) $actual );
		switch ( $op ) {
			case 'eq':
				return in_array( $exp, $arr, true );
			case 'neq':
				return ! in_array( $exp, $arr, true );
			case 'contains':
				return false !== stripos( implode( ' ', $arr ), $exp );
			case 'not_contains':
				return false === stripos( implode( ' ', $arr ), $exp );
			case 'starts':
				return 0 === stripos( implode( ' ', $arr ), $exp );
			case 'ends':
				$j = implode( ' ', $arr );
				return '' !== $exp && strtolower( substr( $j, -strlen( $exp ) ) ) === strtolower( $exp );
			case 'gt':
				return is_numeric( $arr[0] ?? '' ) && (float) $arr[0] > (float) $exp;
			case 'lt':
				return is_numeric( $arr[0] ?? '' ) && (float) $arr[0] < (float) $exp;
			case 'gte':
				return is_numeric( $arr[0] ?? '' ) && (float) $arr[0] >= (float) $exp;
			case 'lte':
				return is_numeric( $arr[0] ?? '' ) && (float) $arr[0] <= (float) $exp;
			case 'empty':
				return '' === trim( implode( '', $arr ) );
			case 'not_empty':
				return '' !== trim( implode( '', $arr ) );
		}
		return false;
	}

	private static function flatten( $a ) {
		$o = array();
		array_walk_recursive( $a, function ( $v ) use ( &$o ) {
			$o[] = $v;
		} );
		return $o;
	}

	/** Names of fields that are visible given submitted data (iterates so chains of logic resolve). */
	public static function visible_fields( $fields, $data ) {
		$visible = array();
		foreach ( $fields as $f ) {
			$visible[ $f['id'] ] = true;
		}
		for ( $pass = 0; $pass < 4; $pass++ ) {
			$view = array();
			foreach ( $fields as $f ) {
				if ( isset( $f['name'] ) && $f['name'] && ! empty( $visible[ $f['id'] ] ) && isset( $data[ $f['name'] ] ) ) {
					$view[ $f['name'] ] = $data[ $f['name'] ];
				}
			}
			$changed = false;
			foreach ( $fields as $f ) {
				$now = self::passes( isset( $f['conditional'] ) ? $f['conditional'] : array(), $view );
				if ( $now !== $visible[ $f['id'] ] ) {
					$visible[ $f['id'] ] = $now;
					$changed             = true;
				}
			}
			if ( ! $changed ) {
				break;
			}
		}
		return $visible;
	}
}
