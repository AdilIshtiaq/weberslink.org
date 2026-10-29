<?php
defined( 'ABSPATH' ) || exit;

/**
 * Safe arithmetic expression evaluator (no eval). Supports + - * / % ^, parentheses,
 * and functions round floor ceil abs min max sqrt pow. Field references: {name}.
 */
class WLFP_Calc {

	private $t;
	private $i;

	public static function evaluate( $formula, $values ) {
		$formula = preg_replace_callback( '/\{([a-z0-9_]+)\}/i', function ( $m ) use ( $values ) {
			$v = isset( $values[ $m[1] ] ) ? $values[ $m[1] ] : 0;
			if ( is_array( $v ) ) {
				$v = array_sum( array_map( 'floatval', $v ) );
			}
			return '(' . ( is_numeric( $v ) ? (float) $v : 0 ) . ')';
		}, (string) $formula );
		$c = new self();
		if ( ! preg_match_all( '/\d+\.?\d*(?:e[+-]?\d+)?|[a-z]+|[-+*\/%^(),]/i', $formula, $m ) ) {
			return 0.0;
		}
		$c->t = $m[0];
		$c->i = 0;
		try {
			$r = $c->expr();
		} catch ( Exception $e ) {
			return 0.0;
		}
		return is_finite( $r ) ? $r : 0.0;
	}

	private function peek() {
		return isset( $this->t[ $this->i ] ) ? $this->t[ $this->i ] : null;
	}

	private function next() {
		return isset( $this->t[ $this->i ] ) ? $this->t[ $this->i++ ] : null;
	}

	private function expr() {
		$v = $this->term();
		while ( in_array( $this->peek(), array( '+', '-' ), true ) ) {
			$op = $this->next();
			$r  = $this->term();
			$v  = '+' === $op ? $v + $r : $v - $r;
		}
		return $v;
	}

	private function term() {
		$v = $this->power();
		while ( in_array( $this->peek(), array( '*', '/', '%' ), true ) ) {
			$op = $this->next();
			$r  = $this->power();
			if ( '*' === $op ) {
				$v *= $r;
			} elseif ( '/' === $op ) {
				$v = 0.0 == $r ? 0.0 : $v / $r;
			} else {
				$v = 0.0 == $r ? 0.0 : fmod( $v, $r );
			}
		}
		return $v;
	}

	private function power() {
		$b = $this->unary();
		if ( '^' === $this->peek() ) {
			$this->next();
			return pow( $b, $this->power() );
		}
		return $b;
	}

	private function unary() {
		if ( '-' === $this->peek() ) {
			$this->next();
			return -$this->unary();
		}
		if ( '+' === $this->peek() ) {
			$this->next();
			return $this->unary();
		}
		return $this->atom();
	}

	private function atom() {
		$t = $this->next();
		if ( null === $t ) {
			throw new Exception( 'eof' );
		}
		if ( '(' === $t ) {
			$v = $this->expr();
			if ( ')' === $this->peek() ) {
				$this->next();
			}
			return $v;
		}
		if ( is_numeric( $t ) ) {
			return (float) $t;
		}
		if ( ctype_alpha( $t ) ) {
			$fn = strtolower( $t );
			if ( '(' !== $this->peek() ) {
				throw new Exception( 'bad' );
			}
			$this->next();
			$args = array();
			if ( ')' !== $this->peek() ) {
				$args[] = $this->expr();
				while ( ',' === $this->peek() ) {
					$this->next();
					$args[] = $this->expr();
				}
			}
			if ( ')' === $this->peek() ) {
				$this->next();
			}
			$a = isset( $args[0] ) ? $args[0] : 0;
			switch ( $fn ) {
				case 'round':
					return round( $a, isset( $args[1] ) ? (int) $args[1] : 0 );
				case 'floor':
					return floor( $a );
				case 'ceil':
					return ceil( $a );
				case 'abs':
					return abs( $a );
				case 'sqrt':
					return $a < 0 ? 0.0 : sqrt( $a );
				case 'pow':
					return pow( $a, isset( $args[1] ) ? $args[1] : 1 );
				case 'min':
					return $args ? min( $args ) : 0.0;
				case 'max':
					return $args ? max( $args ) : 0.0;
			}
			throw new Exception( 'fn' );
		}
		throw new Exception( 'tok' );
	}
}
