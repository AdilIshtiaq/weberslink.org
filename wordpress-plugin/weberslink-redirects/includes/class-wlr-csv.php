<?php
defined( 'ABSPATH' ) || exit;

/** CSV import / export (pure). */
class WLR_Csv {

	const COLS = array( 'source', 'target', 'code', 'match', 'query', 'enabled', 'note' );

	/** Neutralise spreadsheet formulas. */
	public static function cell( $v ) {
		$v = (string) $v;
		return ( '' !== $v && false !== strpos( "=+-@\t\r", $v[0] ) ) ? "'" . $v : $v;
	}

	private static function uncell( $v ) {
		return ( strlen( $v ) > 1 && "'" === $v[0] && false !== strpos( "=+-@\t\r", $v[1] ) ) ? substr( $v, 1 ) : $v;
	}

	public static function build( $rules ) {
		$h = fopen( 'php://temp', 'r+' ); // phpcs:ignore
		fputcsv( $h, self::COLS ); // phpcs:ignore
		foreach ( $rules as $r ) {
			$line = array();
			foreach ( self::COLS as $c ) {
				$line[] = self::cell( isset( $r[ $c ] ) ? $r[ $c ] : '' );
			}
			fputcsv( $h, $line ); // phpcs:ignore
		}
		rewind( $h );
		$out = stream_get_contents( $h );
		fclose( $h ); // phpcs:ignore
		return $out;
	}

	/** Returns array( rules => clean rows, errors => list of "line N: message" ). */
	public static function parse( $text, $max_rows = 5000 ) {
		$text = preg_replace( '/^\xEF\xBB\xBF/', '', (string) $text );
		$h    = fopen( 'php://temp', 'r+' ); // phpcs:ignore
		fwrite( $h, $text ); // phpcs:ignore
		rewind( $h );
		$rules  = array();
		$errors = array();
		$map    = null;
		$line   = 0;
		while ( false !== ( $row = fgetcsv( $h ) ) ) { // phpcs:ignore
			$line++;
			if ( array( null ) === $row ) {
				continue;
			}
			if ( null === $map ) {
				$low = array_map( function ( $c ) {
					return strtolower( trim( (string) $c ) );
				}, $row );
				if ( in_array( 'source', $low, true ) ) {
					$map = array_flip( $low );
					continue;
				}
				$map = array_flip( array( 'source', 'target', 'code', 'match', 'query', 'enabled', 'note' ) ); // headerless file
			}
			if ( count( $rules ) >= $max_rows ) {
				$errors[] = 'Stopped after ' . $max_rows . ' rows.';
				break;
			}
			$d = array();
			foreach ( $map as $col => $i ) {
				$d[ $col ] = isset( $row[ $i ] ) ? self::uncell( trim( (string) $row[ $i ] ) ) : '';
			}
			$d['code'] = '' === ( isset( $d['code'] ) ? $d['code'] : '' ) ? 301 : (int) $d['code'];
			if ( isset( $d['enabled'] ) && '' === $d['enabled'] ) {
				unset( $d['enabled'] );
			}
			list( $clean, $err ) = WLR_Matcher::validate( $d );
			if ( $clean ) {
				$rules[] = $clean;
			} else {
				$errors[] = 'line ' . $line . ': ' . $err;
			}
		}
		fclose( $h ); // phpcs:ignore
		return array( 'rules' => $rules, 'errors' => $errors );
	}
}
