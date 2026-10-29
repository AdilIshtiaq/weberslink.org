<?php
defined( 'ABSPATH' ) || exit;

/** Ready-made form templates. */
class WLFP_Templates {

	private static function f( $type, $name, $label, $o = array() ) {
		return array_merge( WLFP_Fields::defaults( $type ), array( 'name' => $name, 'label' => $label ), $o );
	}

	private static function opts( $list ) {
		$o = array();
		foreach ( $list as $l ) {
			$o[] = array( 'label' => $l, 'value' => sanitize_title( $l ), 'price' => '' );
		}
		return $o;
	}

	public static function all() {
		$T = array();

		$T['blank'] = array( 'title' => __( 'Blank form', 'weberslink-forms-pro' ), 'desc' => __( 'Start from scratch.', 'weberslink-forms-pro' ), 'fields' => array(), 'settings' => array() );

		$T['contact'] = array( 'title' => __( 'Contact form', 'weberslink-forms-pro' ), 'desc' => __( 'Name, email, subject and message.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Your name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'phone', 'phone', 'Phone', array( 'width' => 'half' ) ),
			self::f( 'text', 'subject', 'Subject', array( 'required' => 1 ) ),
			self::f( 'textarea', 'message', 'Message', array( 'required' => 1 ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ), 'button' => array( 'text' => 'Send message' ) ) );

		$T['quote'] = array( 'title' => __( 'Quote / project request', 'weberslink-forms-pro' ), 'desc' => __( 'Multi-step request with budget and file upload.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Your name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Work email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'text', 'company', 'Company', array( 'width' => 'half' ) ),
			self::f( 'page_break', 'pb1', 'Project', array( 'step_title' => 'Project' ) ),
			self::f( 'checkbox', 'services', 'What do you need?', array( 'options' => self::opts( array( 'Web design', 'Development', 'SEO', 'Branding', 'Marketing' ) ), 'required' => 1 ) ),
			self::f( 'select', 'budget', 'Budget', array( 'options' => self::opts( array( 'Under $2k', '$2k – $5k', '$5k – $10k', '$10k+' ) ) ) ),
			self::f( 'date', 'deadline', 'Ideal launch date', array( 'width' => 'half' ) ),
			self::f( 'page_break', 'pb2', 'Details', array( 'step_title' => 'Details' ) ),
			self::f( 'textarea', 'details', 'Tell us about the project', array( 'required' => 1 ) ),
			self::f( 'file', 'brief', 'Attach a brief (optional)', array( 'max_files' => 3 ) ),
			self::f( 'consent', 'consent', '', array( 'required' => 1 ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ), 'button' => array( 'text' => 'Request quote' ) ) );

		$T['newsletter'] = array( 'title' => __( 'Newsletter signup', 'weberslink-forms-pro' ), 'desc' => __( 'Email capture with consent.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'email', 'email', 'Email address', array( 'required' => 1, 'placeholder' => 'you@example.com' ) ),
			self::f( 'consent', 'consent', '', array( 'terms' => 'Yes, send me updates. I can unsubscribe at any time.', 'required' => 1 ) ),
		), 'settings' => array( 'button' => array( 'text' => 'Subscribe' ), 'confirmation' => array( 'message' => '<p>You\'re on the list. Thanks!</p>' ) ) );

		$T['feedback'] = array( 'title' => __( 'Customer feedback', 'weberslink-forms-pro' ), 'desc' => __( 'Rating, NPS and comments.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'rating', 'rating', 'How was your experience?', array( 'required' => 1 ) ),
			self::f( 'nps', 'nps', 'How likely are you to recommend us?' ),
			self::f( 'radio', 'liked', 'What did you like most?', array( 'options' => self::opts( array( 'Quality', 'Speed', 'Support', 'Price' ) ), 'other' => 1 ) ),
			self::f( 'textarea', 'comments', 'Any other comments?' ),
			self::f( 'email', 'email', 'Email (optional, if you\'d like a reply)' ),
		), 'settings' => array() );

		$T['survey'] = array( 'title' => __( 'Satisfaction survey (matrix)', 'weberslink-forms-pro' ), 'desc' => __( 'Likert grid + slider.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'likert', 'satisfaction', 'Please rate the following', array( 'rows_list' => array( array( 'label' => 'Ease of use', 'value' => 'ease' ), array( 'label' => 'Design', 'value' => 'design' ), array( 'label' => 'Value for money', 'value' => 'value' ), array( 'label' => 'Support', 'value' => 'support' ) ), 'required' => 1 ) ),
			self::f( 'range', 'recommend', 'Overall satisfaction (0–100)', array( 'min' => 0, 'max' => 100, 'default' => 70 ) ),
			self::f( 'textarea', 'improve', 'What could we improve?' ),
		), 'settings' => array() );

		$T['registration'] = array( 'title' => __( 'User registration', 'weberslink-forms-pro' ), 'desc' => __( 'Creates a WordPress user on submit.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'text', 'username', 'Username', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'password', 'password', 'Password', array( 'required' => 1 ) ),
			self::f( 'consent', 'consent', '', array( 'required' => 1 ) ),
		), 'settings' => array( 'feeds' => array( array( 'type' => 'user_registration', 'name' => 'Create user', 'enabled' => 1, 'email' => '{field:email}', 'username' => '{field:username}', 'password' => '{field:password}', 'first_name' => '{field:name:first}', 'last_name' => '{field:name:last}', 'role' => 'subscriber', 'notify' => 0 ) ) ) );

		$T['job'] = array( 'title' => __( 'Job application', 'weberslink-forms-pro' ), 'desc' => __( 'Applicant details, CV upload.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Full name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'phone', 'phone', 'Phone', array( 'width' => 'half' ) ),
			self::f( 'select', 'position', 'Position', array( 'options' => self::opts( array( 'Designer', 'Developer', 'Marketer', 'Other' ) ), 'required' => 1 ) ),
			self::f( 'url', 'portfolio', 'Portfolio / LinkedIn' ),
			self::f( 'file', 'cv', 'CV / Résumé', array( 'allowed' => 'pdf,doc,docx', 'required' => 1 ) ),
			self::f( 'textarea', 'cover', 'Cover letter' ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ), 'button' => array( 'text' => 'Apply' ) ) );

		$T['rsvp'] = array( 'title' => __( 'Event RSVP', 'weberslink-forms-pro' ), 'desc' => __( 'Guests, meal choice, conditional questions.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1 ) ),
			self::f( 'radio', 'attending', 'Will you attend?', array( 'options' => array( array( 'label' => 'Yes', 'value' => 'yes', 'price' => '' ), array( 'label' => 'No', 'value' => 'no', 'price' => '' ) ), 'required' => 1, 'layout' => 'horizontal' ) ),
			self::f( 'number', 'guests', 'Number of guests', array( 'min' => 0, 'max' => 10, 'conditional' => array( 'enabled' => 1, 'match' => 'all', 'rules' => array( array( 'field' => 'attending', 'op' => 'eq', 'value' => 'yes' ) ) ) ) ),
			self::f( 'select', 'meal', 'Meal preference', array( 'options' => self::opts( array( 'Vegetarian', 'Vegan', 'Chicken', 'Beef' ) ), 'conditional' => array( 'enabled' => 1, 'match' => 'all', 'rules' => array( array( 'field' => 'attending', 'op' => 'eq', 'value' => 'yes' ) ) ) ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ) ) );

		$T['order'] = array( 'title' => __( 'Order / payment form', 'weberslink-forms-pro' ), 'desc' => __( 'Product, quantity, coupon and order summary (Stripe/PayPal).', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1 ) ),
			self::f( 'payment_item', 'plan', 'Choose a package', array( 'kind' => 'radio', 'required' => 1, 'options' => array( array( 'label' => 'Starter', 'value' => 'starter', 'price' => '49' ), array( 'label' => 'Growth', 'value' => 'growth', 'price' => '99' ), array( 'label' => 'Scale', 'value' => 'scale', 'price' => '199' ) ) ) ),
			self::f( 'coupon', 'coupon', 'Coupon code' ),
			self::f( 'payment_summary', 'summary', 'Order summary' ),
		), 'settings' => array( 'payment' => array( 'provider' => 'stripe' ), 'button' => array( 'text' => 'Pay now' ), 'notifications' => array( self::notify( '{field:email}' ) ) ) );

		return apply_filters( 'wlfp_templates', $T );
	}

	private static function notify( $reply ) {
		$n                = WLFP_Forms::default_settings()['notifications'][0];
		$n['reply_to']    = $reply;
		return $n;
	}

	public static function create( $slug ) {
		$all = self::all();
		$t   = isset( $all[ $slug ] ) ? $all[ $slug ] : $all['blank'];
		return WLFP_Forms::save( 0, array( 'title' => 'blank' === $slug ? __( 'New form', 'weberslink-forms-pro' ) : $t['title'], 'status' => 'published', 'fields' => $t['fields'], 'settings' => array_replace_recursive( WLFP_Forms::default_settings(), $t['settings'] ) ) );
	}
}
