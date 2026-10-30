<?php
defined( 'ABSPATH' ) || exit;

/** Failed-login accounting (pure: state in, state out). State: array( fails => timestamps, locks => int, until => ts ). */
class WLSS_Limiter {

	public static function fresh() {
		return array( 'fails' => array(), 'locks' => 0, 'until' => 0 );
	}

	public static function is_locked( $state, $now ) {
		return (int) $state['until'] > $now;
	}

	public static function seconds_left( $state, $now ) {
		return max( 0, (int) $state['until'] - $now );
	}

	/** How long the next lock lasts: lock_min, doubled each time this address is locked again (max 24 h). */
	public static function lock_seconds( $locks, $cfg ) {
		$base = (int) $cfg['lock_min'] * 60;
		$n    = ! empty( $cfg['escalate'] ) ? min( max( 0, (int) $locks ), 8 ) : 0;
		return min( $base * ( 2 ** $n ), 86400 );
	}

	/** Record a failure; returns array( state, just_locked ). */
	public static function fail( $state, $now, $cfg ) {
		$window = (int) $cfg['window_min'] * 60;
		$fails  = array_values( array_filter( $state['fails'], function ( $t ) use ( $now, $window ) {
			return $t > $now - $window;
		} ) );
		$fails[] = $now;
		$locked  = false;
		if ( count( $fails ) >= (int) $cfg['max_attempts'] && ! self::is_locked( $state, $now ) ) {
			$state['until'] = $now + self::lock_seconds( $state['locks'], $cfg );
			$state['locks'] = (int) $state['locks'] + 1;
			$fails          = array();
			$locked         = true;
		}
		$state['fails'] = array_slice( $fails, -50 );
		return array( $state, $locked );
	}

	/** After a successful login the failed attempts are forgotten; the lock history is kept so repeat offenders escalate. */
	public static function success( $state ) {
		$state['fails'] = array();
		return $state;
	}
}
