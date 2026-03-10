program xnoise_driver
  implicit none

  integer, parameter :: ix = 100
  integer, parameter :: ixp = ix + 1
  integer, parameter :: nax = 20
  integer, parameter :: ndx = 14

  character(len=32) :: command

  call get_command_argument(1, command)

  select case (trim(adjustl(command)))
  case ('setexp', 'SETEXP')
    call run_setexp()
  case ('gauss', 'GAUSS')
    call run_gauss()
  case ('ludcmp', 'LUDCMP')
    call run_ludcmp()
  case ('baksub', 'BAKSUB')
    call run_baksub()
  case ('srclin', 'SRCLIN')
    call run_srclin()
  case ('srcvel', 'SRCVEL')
    call run_srcvel()
  case ('vrtxco', 'VRTXCO')
    call run_vrtxco()
  case ('vorsegvel', 'VORSEGVEL')
    call run_vorsegvel()
  case ('sortar', 'SORTAR')
    call run_sortar()
  case ('setiaero', 'SETIAERO')
    call run_setiaero()
  case ('getaero', 'GETAERO')
    call run_getaero()
  case ('putaero', 'PUTAERO')
    call run_putaero()
  case ('clcdcm', 'CLCDCM')
    call run_clcdcm()
  case ('getclcdcm', 'GETCLCDCM')
    call run_getclcdcm()
  case ('getalf', 'GETALF')
    call run_getalf()
  case ('chklim', 'CHKLIM')
    call run_chklim()
  case ('eiload', 'EILOAD')
    call run_eiload()
  case ('stclr', 'STCLR')
    call run_stclr()
  case ('mclr', 'MCLR')
    call run_mclr()
  case ('stadd', 'STADD')
    call run_stadd()
  case ('stset', 'STSET')
    call run_stset()
  case ('b12sol', 'B12SOL')
    call run_b12sol()
  case ('stload', 'STLOAD')
    call run_stload()
  case ('stcalc', 'STCALC')
    call run_stcalc()
  case ('trisol', 'TRISOL')
    call run_trisol()
  case ('spline', 'SPLINE')
    call run_spline()
  case ('splind', 'SPLIND')
    call run_splind()
  case ('splina', 'SPLINA')
    call run_splina()
  case ('seval', 'SEVAL')
    call run_seval()
  case ('deval', 'DEVAL')
    call run_deval()
  case ('d2val', 'D2VAL')
    call run_d2val()
  case ('sevall', 'SEVALL')
    call run_sevall()
  case ('curv', 'CURV')
    call run_curv()
  case ('curvs', 'CURVS')
    call run_curvs()
  case ('sinvrt', 'SINVRT')
    call run_sinvrt()
  case ('scalc', 'SCALC')
    call run_scalc()
  case ('segspl', 'SEGSPL')
    call run_segspl()
  case ('inters', 'INTERS')
    call run_inters()
  case ('nearpt', 'NEARPT')
    call run_nearpt()
  case ('sevlin', 'SEVLIN')
    call run_sevlin()
  case ('ssevlin', 'SSEVLIN')
    call run_ssevlin()
  case ('dsevlin', 'DSEVLIN')
    call run_dsevlin()
  case ('scalit', 'SCALIT')
    call run_scalit()
  case ('ptrace', 'PTRACE')
    call run_ptrace()
  case ('sft', 'SFT')
    call run_sft()
  case ('psplin', 'PSPLIN')
    call run_psplin()
  case ('ptriso', 'PTRISO')
    call run_ptriso()
  case ('dbfoot', 'DBFOOT')
    call run_dbfoot()
  case default
    write(*,'(A)') 'unknown command'
    stop 1
  end select

contains

  subroutine read_vector(values, n)
    implicit none
    integer, intent(in) :: n
    real, intent(out) :: values(n)
    integer :: i

    do i = 1, n
      read(*,*) values(i)
    end do
  end subroutine read_vector

  subroutine read_int_vector(values, n)
    implicit none
    integer, intent(in) :: n
    integer, intent(out) :: values(n)
    integer :: i

    do i = 1, n
      read(*,*) values(i)
    end do
  end subroutine read_int_vector

  subroutine read_matrix(values, nrows, ncols)
    implicit none
    integer, intent(in) :: nrows
    integer, intent(in) :: ncols
    real, intent(out) :: values(nrows, ncols)
    integer :: i
    integer :: j

    do i = 1, nrows
      do j = 1, ncols
        read(*,*) values(i, j)
      end do
    end do
  end subroutine read_matrix

  subroutine init_aero_storage(naero_in, xiaero_in, aerodata_in)
    implicit none
    integer, intent(in) :: naero_in
    real, intent(in) :: xiaero_in(naero_in)
    real, intent(in) :: aerodata_in(13, naero_in)
    integer :: naero_c
    integer :: i
    integer :: j
    real :: xiaero_c(nax)
    real :: aerodata_c(ndx, nax)
    common /ifoil_x/ naero_c
    common /rfoil_x/ xiaero_c, aerodata_c

    naero_c = naero_in
    do i = 1, nax
      xiaero_c(i) = 0.0
      do j = 1, ndx
        aerodata_c(j, i) = 0.0
      end do
    end do
    do i = 1, naero_in
      xiaero_c(i) = xiaero_in(i)
      do j = 1, 13
        aerodata_c(j, i) = aerodata_in(j, i)
      end do
    end do
  end subroutine init_aero_storage

  subroutine init_aero_geom(ii_in, xi_in, iaero_in)
    implicit none
    integer, intent(in) :: ii_in
    real, intent(in) :: xi_in(ii_in)
    integer, intent(in) :: iaero_in(ii_in)
    integer :: ii_c
    integer :: iinf_c
    integer :: incr_c
    integer :: nn_c
    integer :: nblds_c
    integer :: ixspac_c
    integer :: niterd_c
    integer :: nitera_c
    integer :: iaero_c(ix)
    integer :: i
    real :: ch_c(ix)
    real :: beta_c(ix)
    real :: beta0_c(ix)
    real :: t_c(ix)
    real :: dbeta_c
    real :: xi_c(ix)
    real :: dxi_c(ix)
    real :: xi0_c
    real :: xitip_c
    real :: xinf_c
    real :: xpitch_c
    real :: xv_c(ix)
    real :: rake_c
    common /icon_x/ ii_c, iinf_c, incr_c, nn_c, nblds_c, ixspac_c, niterd_c, nitera_c
    common /igeom_x/ iaero_c
    common /rgeom_x/ ch_c, beta_c, beta0_c, t_c, dbeta_c, xi_c, dxi_c, xi0_c, xitip_c, xinf_c, xpitch_c, xv_c, rake_c

    ii_c = ii_in
    iinf_c = 0
    incr_c = 0
    nn_c = 0
    nblds_c = 0
    ixspac_c = 0
    niterd_c = 0
    nitera_c = 0
    dbeta_c = 0.0
    xi0_c = 0.0
    xitip_c = 0.0
    xinf_c = 0.0
    xpitch_c = 0.0
    rake_c = 0.0
    do i = 1, ix
      iaero_c(i) = 0
      ch_c(i) = 0.0
      beta_c(i) = 0.0
      beta0_c(i) = 0.0
      t_c(i) = 0.0
      xi_c(i) = 0.0
      dxi_c(i) = 0.0
      xv_c(i) = 0.0
    end do
    do i = 1, ii_in
      xi_c(i) = xi_in(i)
      iaero_c(i) = iaero_in(i)
    end do
  end subroutine init_aero_geom

  subroutine init_flow_state(vel_in, vso_in)
    implicit none
    real, intent(in) :: vel_in
    real, intent(in) :: vso_in
    real :: rho_c
    real :: rmu_c
    real :: vso_c
    real :: vel_c
    real :: rad_c
    real :: gee_c
    real :: alt_c
    common /dime_x/ rho_c, rmu_c, vso_c, vel_c, rad_c, gee_c, alt_c

    rho_c = 0.0
    rmu_c = 0.0
    vso_c = vso_in
    vel_c = vel_in
    rad_c = 0.0
    gee_c = 0.0
    alt_c = 0.0
  end subroutine init_flow_state

  subroutine init_xbend_state(ii_in, rad_in, vel_in, vso_in, rho_in, adv_in, rake_in, incr_in, lstruc_in, &
                              xi_in, dxi_in, ch_in, beta_in, beta0_in, cl_in, cd_in, cm_in, &
                              eixxb_in, eiyyb_in, eab_in, gjb_in, ekb_in, mb_in, mxxb_in, &
                              xocg_in, xosc_in, rstb_in, px_in, py_in, pz_in, mx_in, my_in, mz_in, &
                              px_ty_in, px_tz_in, pz_tx_in, pz_ty_in, pz_wz_in, my_ty_in, mz_ty_in, mz_tx_in, mz_wz_in, &
                              tx_in, ty_in, tz_in, wx_in, wy_in, wz_in, shrx_in, shry_in, shrz_in, momx_in, momy_in, momz_in)
    implicit none

    integer, intent(in) :: ii_in
    integer, intent(in) :: incr_in
    logical, intent(in) :: lstruc_in
    real, intent(in) :: rad_in
    real, intent(in) :: vel_in
    real, intent(in) :: vso_in
    real, intent(in) :: rho_in
    real, intent(in) :: adv_in
    real, intent(in) :: rake_in
    real, intent(in) :: xi_in(ii_in)
    real, intent(in) :: dxi_in(ii_in)
    real, intent(in) :: ch_in(ii_in)
    real, intent(in) :: beta_in(ii_in)
    real, intent(in) :: beta0_in(ii_in)
    real, intent(in) :: cl_in(ii_in)
    real, intent(in) :: cd_in(ii_in)
    real, intent(in) :: cm_in(ii_in)
    real, intent(in) :: eixxb_in(ii_in)
    real, intent(in) :: eiyyb_in(ii_in)
    real, intent(in) :: eab_in(ii_in)
    real, intent(in) :: gjb_in(ii_in)
    real, intent(in) :: ekb_in(ii_in)
    real, intent(in) :: mb_in(ii_in)
    real, intent(in) :: mxxb_in(ii_in)
    real, intent(in) :: xocg_in(ii_in)
    real, intent(in) :: xosc_in(ii_in)
    real, intent(in) :: rstb_in(ii_in)
    real, intent(in) :: px_in(ii_in)
    real, intent(in) :: py_in(ii_in)
    real, intent(in) :: pz_in(ii_in)
    real, intent(in) :: mx_in(ii_in)
    real, intent(in) :: my_in(ii_in)
    real, intent(in) :: mz_in(ii_in)
    real, intent(in) :: px_ty_in(ii_in)
    real, intent(in) :: px_tz_in(ii_in)
    real, intent(in) :: pz_tx_in(ii_in)
    real, intent(in) :: pz_ty_in(ii_in)
    real, intent(in) :: pz_wz_in(ii_in)
    real, intent(in) :: my_ty_in(ii_in)
    real, intent(in) :: mz_ty_in(ii_in)
    real, intent(in) :: mz_tx_in(ii_in)
    real, intent(in) :: mz_wz_in(ii_in)
    real, intent(in) :: tx_in(ii_in + 1)
    real, intent(in) :: ty_in(ii_in + 1)
    real, intent(in) :: tz_in(ii_in + 1)
    real, intent(in) :: wx_in(ii_in + 1)
    real, intent(in) :: wy_in(ii_in + 1)
    real, intent(in) :: wz_in(ii_in + 1)
    real, intent(in) :: shrx_in(ii_in + 1)
    real, intent(in) :: shry_in(ii_in + 1)
    real, intent(in) :: shrz_in(ii_in + 1)
    real, intent(in) :: momx_in(ii_in + 1)
    real, intent(in) :: momy_in(ii_in + 1)
    real, intent(in) :: momz_in(ii_in + 1)

    integer :: i
    logical :: conv_c
    logical :: greek_c
    logical :: terse_c
    logical :: vrtx_c
    logical :: fast_c
    logical :: free_c
    logical :: duct_c
    logical :: lstruc_c
    logical :: ldesini_c
    logical :: loprini_c
    logical :: lrotor_c
    logical :: lvnorm_c
    logical :: lpwrvar_c
    logical :: wind_c
    logical :: dest_c
    logical :: desp_c
    logical :: stall_c(ix)
    logical :: legend_c
    integer :: ii_c
    integer :: iinf_c
    integer :: incr_c
    integer :: nn_c
    integer :: nblds_c
    integer :: ixspac_c
    integer :: niterd_c
    integer :: nitera_c
    real :: rho_c
    real :: rmu_c
    real :: vso_c
    real :: vel_c
    real :: rad_c
    real :: gee_c
    real :: alt_c
    real :: ch_c(ix)
    real :: beta_c(ix)
    real :: beta0_c(ix)
    real :: t_c(ix)
    real :: dbeta_c
    real :: xi_c(ix)
    real :: dxi_c(ix)
    real :: xi0_c
    real :: xitip_c
    real :: xinf_c
    real :: xpitch_c
    real :: xv_c(ix)
    real :: rake_c
    real :: cl_c(ix)
    real :: cd_c(ix)
    real :: cm_c(ix)
    real :: re_c(ix)
    real :: effp_c(ix)
    real :: gam_c(ix)
    real :: dtii_c(ix)
    real :: dpii_c(ix)
    real :: dtvi_c(ix)
    real :: dpvi_c(ix)
    real :: dtwi_c(ix)
    real :: dpwi_c(ix)
    real :: px_c(ix)
    real :: py_c(ix)
    real :: pz_c(ix)
    real :: mx_c(ix)
    real :: my_c(ix)
    real :: mz_c(ix)
    real :: px_ty_c(ix)
    real :: px_tz_c(ix)
    real :: pz_tx_c(ix)
    real :: pz_ty_c(ix)
    real :: pz_wz_c(ix)
    real :: my_ty_c(ix)
    real :: mz_ty_c(ix)
    real :: mz_tx_c(ix)
    real :: mz_wz_c(ix)
    real :: tx_c(ixp)
    real :: ty_c(ixp)
    real :: tz_c(ixp)
    real :: wx_c(ixp)
    real :: wy_c(ixp)
    real :: wz_c(ixp)
    real :: shrx_c(ixp)
    real :: shry_c(ixp)
    real :: shrz_c(ixp)
    real :: momx_c(ixp)
    real :: momy_c(ixp)
    real :: momz_c(ixp)
    real :: eixxb_c(ix)
    real :: eiyyb_c(ix)
    real :: eab_c(ix)
    real :: gjb_c(ix)
    real :: ekb_c(ix)
    real :: mb_c(ix)
    real :: mxxb_c(ix)
    real :: xocg_c(ix)
    real :: xosc_c(ix)
    real :: rstb_c(ix)
    real :: adv_c
    real :: adw_c
    real :: adwfctr_c
    real :: rms_c
    real :: rlx_c
    real :: effinv_c
    real :: tspec_c
    real :: pspec_c
    real :: qspec_c
    real :: ttot_c
    real :: ptot_c
    real :: qtot_c
    real :: tinv_c
    real :: pinv_c
    real :: twak_c
    real :: pwak_c
    real :: tvis_c
    real :: pvis_c
    real :: gresmx_c
    real :: fresmx_c
    real :: aresmx_c

    common /logi_x/ conv_c, greek_c, terse_c, vrtx_c, fast_c, free_c, duct_c, lstruc_c, &
                    ldesini_c, loprini_c, lrotor_c, lvnorm_c, lpwrvar_c, wind_c, dest_c, desp_c, stall_c, legend_c
    common /dime_x/ rho_c, rmu_c, vso_c, vel_c, rad_c, gee_c, alt_c
    common /icon_x/ ii_c, iinf_c, incr_c, nn_c, nblds_c, ixspac_c, niterd_c, nitera_c
    common /rgeom_x/ ch_c, beta_c, beta0_c, t_c, dbeta_c, xi_c, dxi_c, xi0_c, xitip_c, xinf_c, xpitch_c, xv_c, rake_c
    common /aero_x/ cl_c, cd_c, cm_c, re_c, effp_c, gam_c, dtii_c, dpii_c, dtvi_c, dpvi_c, dtwi_c, dpwi_c
    common /load_x/ px_c, py_c, pz_c, mx_c, my_c, mz_c, px_ty_c, px_tz_c, pz_tx_c, pz_ty_c, pz_wz_c, &
                    my_ty_c, mz_ty_c, mz_tx_c, mz_wz_c, tx_c, ty_c, tz_c, wx_c, wy_c, wz_c, &
                    shrx_c, shry_c, shrz_c, momx_c, momy_c, momz_c, eixxb_c, eiyyb_c, eab_c, gjb_c, ekb_c, &
                    mb_c, mxxb_c, xocg_c, xosc_c, rstb_c
    common /oper_x/ adv_c, adw_c, adwfctr_c, rms_c, rlx_c, effinv_c, tspec_c, pspec_c, qspec_c, &
                    ttot_c, ptot_c, qtot_c, tinv_c, pinv_c, twak_c, pwak_c, tvis_c, pvis_c, gresmx_c, fresmx_c, aresmx_c

    conv_c = .false.
    greek_c = .false.
    terse_c = .false.
    vrtx_c = .false.
    fast_c = .false.
    free_c = .false.
    duct_c = .false.
    lstruc_c = lstruc_in
    ldesini_c = .false.
    loprini_c = .false.
    lrotor_c = .false.
    lvnorm_c = .false.
    lpwrvar_c = .false.
    wind_c = .false.
    dest_c = .false.
    desp_c = .false.
    legend_c = .false.
    do i = 1, ix
      stall_c(i) = .false.
    end do

    rho_c = rho_in
    rmu_c = 0.0
    vso_c = vso_in
    vel_c = vel_in
    rad_c = rad_in
    gee_c = 0.0
    alt_c = 0.0

    ii_c = ii_in
    iinf_c = 0
    incr_c = incr_in
    nn_c = 0
    nblds_c = 0
    ixspac_c = 0
    niterd_c = 0
    nitera_c = 0

    dbeta_c = 0.0
    xi0_c = 0.0
    xitip_c = 1.0
    xinf_c = 0.0
    xpitch_c = 0.0
    rake_c = rake_in

    adv_c = adv_in
    adw_c = 0.0
    adwfctr_c = 0.0
    rms_c = 0.0
    rlx_c = 1.0
    effinv_c = 0.0
    tspec_c = 0.0
    pspec_c = 0.0
    qspec_c = 0.0
    ttot_c = 0.0
    ptot_c = 0.0
    qtot_c = 0.0
    tinv_c = 0.0
    pinv_c = 0.0
    twak_c = 0.0
    pwak_c = 0.0
    tvis_c = 0.0
    pvis_c = 0.0
    gresmx_c = 0.0
    fresmx_c = 0.0
    aresmx_c = 0.0

    do i = 1, ix
      ch_c(i) = 0.0
      beta_c(i) = 0.0
      beta0_c(i) = 0.0
      t_c(i) = 0.0
      xi_c(i) = 0.0
      dxi_c(i) = 0.0
      xv_c(i) = 0.0
      cl_c(i) = 0.0
      cd_c(i) = 0.0
      cm_c(i) = 0.0
      re_c(i) = 0.0
      effp_c(i) = 0.0
      gam_c(i) = 0.0
      dtii_c(i) = 0.0
      dpii_c(i) = 0.0
      dtvi_c(i) = 0.0
      dpvi_c(i) = 0.0
      dtwi_c(i) = 0.0
      dpwi_c(i) = 0.0
      px_c(i) = 0.0
      py_c(i) = 0.0
      pz_c(i) = 0.0
      mx_c(i) = 0.0
      my_c(i) = 0.0
      mz_c(i) = 0.0
      px_ty_c(i) = 0.0
      px_tz_c(i) = 0.0
      pz_tx_c(i) = 0.0
      pz_ty_c(i) = 0.0
      pz_wz_c(i) = 0.0
      my_ty_c(i) = 0.0
      mz_ty_c(i) = 0.0
      mz_tx_c(i) = 0.0
      mz_wz_c(i) = 0.0
      eixxb_c(i) = 0.0
      eiyyb_c(i) = 0.0
      eab_c(i) = 0.0
      gjb_c(i) = 0.0
      ekb_c(i) = 0.0
      mb_c(i) = 0.0
      mxxb_c(i) = 0.0
      xocg_c(i) = 0.0
      xosc_c(i) = 0.0
      rstb_c(i) = 0.0
    end do

    do i = 1, ixp
      tx_c(i) = 0.0
      ty_c(i) = 0.0
      tz_c(i) = 0.0
      wx_c(i) = 0.0
      wy_c(i) = 0.0
      wz_c(i) = 0.0
      shrx_c(i) = 0.0
      shry_c(i) = 0.0
      shrz_c(i) = 0.0
      momx_c(i) = 0.0
      momy_c(i) = 0.0
      momz_c(i) = 0.0
    end do

    do i = 1, ii_in
      xi_c(i) = xi_in(i)
      dxi_c(i) = dxi_in(i)
      ch_c(i) = ch_in(i)
      beta_c(i) = beta_in(i)
      beta0_c(i) = beta0_in(i)
      cl_c(i) = cl_in(i)
      cd_c(i) = cd_in(i)
      cm_c(i) = cm_in(i)
      eixxb_c(i) = eixxb_in(i)
      eiyyb_c(i) = eiyyb_in(i)
      eab_c(i) = eab_in(i)
      gjb_c(i) = gjb_in(i)
      ekb_c(i) = ekb_in(i)
      mb_c(i) = mb_in(i)
      mxxb_c(i) = mxxb_in(i)
      xocg_c(i) = xocg_in(i)
      xosc_c(i) = xosc_in(i)
      rstb_c(i) = rstb_in(i)
      px_c(i) = px_in(i)
      py_c(i) = py_in(i)
      pz_c(i) = pz_in(i)
      mx_c(i) = mx_in(i)
      my_c(i) = my_in(i)
      mz_c(i) = mz_in(i)
      px_ty_c(i) = px_ty_in(i)
      px_tz_c(i) = px_tz_in(i)
      pz_tx_c(i) = pz_tx_in(i)
      pz_ty_c(i) = pz_ty_in(i)
      pz_wz_c(i) = pz_wz_in(i)
      my_ty_c(i) = my_ty_in(i)
      mz_ty_c(i) = mz_ty_in(i)
      mz_tx_c(i) = mz_tx_in(i)
      mz_wz_c(i) = mz_wz_in(i)
    end do

    do i = 1, ii_in + 1
      tx_c(i) = tx_in(i)
      ty_c(i) = ty_in(i)
      tz_c(i) = tz_in(i)
      wx_c(i) = wx_in(i)
      wy_c(i) = wy_in(i)
      wz_c(i) = wz_in(i)
      shrx_c(i) = shrx_in(i)
      shry_c(i) = shry_in(i)
      shrz_c(i) = shrz_in(i)
      momx_c(i) = momx_in(i)
      momy_c(i) = momy_in(i)
      momz_c(i) = momz_in(i)
    end do
  end subroutine init_xbend_state

  subroutine run_setexp()
    implicit none
    external setexp

    integer :: nn
    integer :: i
    real :: smax
    real, allocatable :: s(:)

    read(*,*) nn
    read(*,*) smax

    allocate(s(nn))

    call read_vector(s, nn)
    call setexp(s, smax, nn)

    write(*,'(A)') 'RESULT setexp'
    write(*,'(I0)') nn
    do i = 1, nn
      write(*,'(ES24.16E3)') s(i)
    end do
  end subroutine run_setexp

  subroutine run_gauss()
    implicit none
    external gauss

    integer :: nsiz
    integer :: nn
    integer :: nrhs
    integer :: i
    integer :: j
    real, allocatable :: z(:,:)
    real, allocatable :: r(:,:)

    read(*,*) nsiz, nn, nrhs

    allocate(z(nsiz, nsiz), r(nsiz, nrhs))

    call read_matrix(z, nsiz, nsiz)
    call read_matrix(r, nsiz, nrhs)

    call gauss(nsiz, nn, z, r, nrhs)

    write(*,'(A)') 'RESULT gauss'
    write(*,'(I0,1X,I0)') nn, nrhs
    do i = 1, nsiz
      do j = 1, nsiz
        write(*,'(ES24.16E3)') z(i, j)
      end do
    end do
    do i = 1, nsiz
      do j = 1, nrhs
        write(*,'(ES24.16E3)') r(i, j)
      end do
    end do
  end subroutine run_gauss

  subroutine run_ludcmp()
    implicit none
    external ludcmp

    integer :: nsiz
    integer :: n
    integer :: i
    integer :: j
    integer, allocatable :: indx(:)
    real, allocatable :: a(:,:)

    read(*,*) nsiz, n

    allocate(a(nsiz, nsiz), indx(nsiz))

    call read_matrix(a, nsiz, nsiz)
    call ludcmp(nsiz, n, a, indx)

    write(*,'(A)') 'RESULT ludcmp'
    write(*,'(I0)') n
    do i = 1, nsiz
      do j = 1, nsiz
        write(*,'(ES24.16E3)') a(i, j)
      end do
    end do
    do i = 1, nsiz
      write(*,'(I0)') indx(i)
    end do
  end subroutine run_ludcmp

  subroutine run_baksub()
    implicit none
    external baksub

    integer :: nsiz
    integer :: n
    integer :: i
    integer, allocatable :: indx(:)
    real, allocatable :: a(:,:)
    real, allocatable :: b(:)

    read(*,*) nsiz, n

    allocate(a(nsiz, nsiz), indx(nsiz), b(nsiz))

    call read_matrix(a, nsiz, nsiz)
    call read_int_vector(indx, nsiz)
    call read_vector(b, nsiz)

    call baksub(nsiz, n, a, indx, b)

    write(*,'(A)') 'RESULT baksub'
    write(*,'(I0)') n
    do i = 1, nsiz
      write(*,'(ES24.16E3)') b(i)
    end do
  end subroutine run_baksub

  subroutine run_srclin()
    implicit none
    external srclin

    integer :: nb
    integer :: i
    real, allocatable :: zb(:)
    real, allocatable :: rb(:)
    real, allocatable :: src(:)

    read(*,*) nb

    allocate(zb(nb), rb(nb), src(nb - 1))

    call read_vector(zb, nb)
    call read_vector(rb, nb)

    call srclin(nb, zb, rb, src)

    write(*,'(A)') 'RESULT srclin'
    write(*,'(I0)') nb - 1
    do i = 1, nb - 1
      write(*,'(ES24.16E3)') src(i)
    end do
  end subroutine run_srclin

  subroutine run_srcvel()
    implicit none
    external srcvel

    integer :: nb
    real :: z
    real :: r
    real :: u
    real :: v
    real, allocatable :: zb(:)
    real, allocatable :: src(:)

    read(*,*) nb
    read(*,*) z, r

    allocate(zb(nb), src(nb - 1))

    call read_vector(zb, nb)
    call read_vector(src, nb - 1)

    call srcvel(nb, zb, src, z, r, u, v)

    write(*,'(A)') 'RESULT srcvel'
    write(*,'(ES24.16E3,1X,ES24.16E3)') u, v
  end subroutine run_srcvel

  subroutine run_vrtxco()
    implicit none
    external vrtxco

    integer, parameter :: ntdim = 5000
    logical :: lduct
    integer :: imax
    integer :: ii
    integer :: nblds
    integer :: lduct_flag
    integer :: i
    integer :: j
    integer :: k
    integer :: n1
    integer :: n2
    integer :: nthet
    integer :: overflow_flag
    integer :: idx
    real :: rake
    real :: adw
    real :: pi
    real :: dth1
    real :: dth2
    real :: dth3
    real :: rad1
    real :: rad2
    real :: rad3
    real :: thet1
    real :: thet2
    real :: thet3
    real :: ddth1
    real :: ddth2
    real :: dth
    real :: thet
    real, allocatable :: xi(:)
    real, allocatable :: xv(:)
    real, allocatable :: gam(:)
    real, allocatable :: vind_adw(:,:)
    real, allocatable :: vind_gam(:,:,:)

    read(*,*) imax, ii, nblds, lduct_flag
    read(*,*) rake, adw

    lduct = lduct_flag .ne. 0

    allocate(xi(imax), xv(imax), gam(imax))
    allocate(vind_adw(3, imax), vind_gam(3, imax, imax))

    call read_vector(xi, imax)
    call read_vector(xv, imax)
    call read_vector(gam, imax)

    pi = 4.0*atan(1.0)
    dth1  = pi / 60.0
    rad1  = 2.0
    thet1 = rad1/adw
    dth2  = pi / 20.0
    rad2  = 4.0
    thet2 = rad2/adw
    dth3  = pi / 8.0
    rad3  = 50.0
    thet3 = rad3/adw
    n1 = ifix(2.0*(thet1      )/(dth2+dth1))
    n2 = ifix(2.0*(thet2-thet1)/(dth3+dth2))
    ddth1 = (dth2-dth1)/float(n1-1)
    ddth2 = (dth3-dth2)/float(n2-1)

    thet = 0.0
    dth = dth1
    overflow_flag = 1
    nthet = ntdim
    do idx = 1, ntdim
      if (thet .lt. thet1) then
        thet = thet + dth
        dth = dth + ddth1
      else if (thet .lt. thet2) then
        thet = thet + dth
        dth = dth + ddth2
      else if (thet .lt. thet3) then
        dth = dth3
        thet = thet + dth
      else
        nthet = idx - 1
        overflow_flag = 0
        exit
      end if
    end do

    call vrtxco(imax, ii, nblds, lduct, rake, xi, xv, gam, adw, vind_gam, vind_adw)

    write(*,'(A)') 'RESULT vrtxco'
    write(*,'(I0,1X,I0,1X,I0)') ii, nthet, overflow_flag
    do k = 1, 3
      do i = 1, ii
        do j = 1, ii
          write(*,'(ES24.16E3)') vind_gam(k, i, j)
        end do
      end do
    end do
    do k = 1, 3
      do i = 1, ii
        write(*,'(ES24.16E3)') vind_adw(k, i)
      end do
    end do
  end subroutine run_vrtxco

  subroutine run_vorsegvel()
    implicit none
    external vorsegvel

    integer :: i
    integer :: j
    real, allocatable :: a(:)
    real, allocatable :: b(:)
    real, allocatable :: uvw(:)
    real, allocatable :: uvw_a(:,:)
    real, allocatable :: uvw_b(:,:)

    allocate(a(3), b(3), uvw(3), uvw_a(3, 3), uvw_b(3, 3))

    call read_vector(a, 3)
    call read_vector(b, 3)

    call vorsegvel(a, b, uvw, uvw_a, uvw_b)

    write(*,'(A)') 'RESULT vorsegvel'
    do i = 1, 3
      write(*,'(ES24.16E3)') uvw(i)
    end do
    do i = 1, 3
      do j = 1, 3
        write(*,'(ES24.16E3)') uvw_a(i, j)
      end do
    end do
    do i = 1, 3
      do j = 1, 3
        write(*,'(ES24.16E3)') uvw_b(i, j)
      end do
    end do
  end subroutine run_vorsegvel

  subroutine run_sortar()
    implicit none
    external sortar

    integer :: ns
    integer :: ndim
    integer :: i
    integer :: l
    real, allocatable :: s(:)
    real, allocatable :: w(:,:)

    read(*,*) ns, ndim

    allocate(s(ns), w(ndim, ns))

    call read_vector(s, ns)
    call read_matrix(w, ndim, ns)

    call sortar(ns, s, w, ndim)

    write(*,'(A)') 'RESULT sortar'
    write(*,'(I0,1X,I0)') ns, ndim
    do i = 1, ns
      write(*,'(ES24.16E3)') s(i)
    end do
    do l = 1, ndim
      do i = 1, ns
        write(*,'(ES24.16E3)') w(l, i)
      end do
    end do
  end subroutine run_sortar

  subroutine run_setiaero()
    implicit none
    external setiaero

    integer :: ii
    integer :: naero
    integer :: i
    integer, allocatable :: iaero(:)
    real, allocatable :: xi(:)
    real, allocatable :: xiaero(:)
    real, allocatable :: aerodata(:,:)

    read(*,*) ii, naero

    allocate(xi(ii), iaero(ii), xiaero(naero), aerodata(13, naero))
    iaero = 0
    aerodata = 0.0

    call read_vector(xi, ii)
    call read_vector(xiaero, naero)

    call init_aero_storage(naero, xiaero, aerodata)
    call init_aero_geom(ii, xi, iaero)
    call setiaero()
    call sync_iaero(ii, iaero)
    write(*,'(A)') 'RESULT setiaero'
    write(*,'(I0)') ii
    do i = 1, ii
      write(*,'(I0)') iaero(i)
    end do
  end subroutine run_setiaero

  subroutine sync_iaero(ii_out, iaero_out)
    implicit none
    integer, intent(in) :: ii_out
    integer, intent(out) :: iaero_out(ii_out)
    integer :: iaero_c(ix)
    integer :: i
    common /igeom_x/ iaero_c

    do i = 1, ii_out
      iaero_out(i) = iaero_c(i)
    end do
  end subroutine sync_iaero

  subroutine run_getaero()
    implicit none
    external getaero

    integer :: naero
    integer :: n
    real :: xisect
    real :: a0
    real :: clmax
    real :: clmin
    real :: dclda
    real :: dclda_stall
    real :: dcl_stall
    real :: cdmin
    real :: cldmin
    real :: dcdcl2
    real :: cmcon
    real :: mcrit
    real :: reref
    real :: rexp
    real, allocatable :: xiaero(:)
    real, allocatable :: aerodata(:,:)

    read(*,*) naero, n

    allocate(xiaero(naero), aerodata(13, naero))

    call read_vector(xiaero, naero)
    call read_matrix(aerodata, 13, naero)

    call init_aero_storage(naero, xiaero, aerodata)
    call getaero(n, xisect, a0, clmax, clmin, dclda, dclda_stall, dcl_stall, &
                 cdmin, cldmin, dcdcl2, cmcon, mcrit, reref, rexp)

    write(*,'(A)') 'RESULT getaero'
    write(*,'(14(ES24.16E3,1X))') xisect, a0, clmax, clmin, dclda, dclda_stall, &
      dcl_stall, cdmin, cldmin, dcdcl2, cmcon, mcrit, reref, rexp
  end subroutine run_getaero

  subroutine run_putaero()
    implicit none
    external putaero

    integer :: n
    real :: xisect
    real :: a0
    real :: clmax
    real :: clmin
    real :: dclda
    real :: dclda_stall
    real :: dcl_stall
    real :: cdmin
    real :: cldmin
    real :: dcdcl2
    real :: cmcon
    real :: mcrit
    real :: reref
    real :: rexp
    integer :: naero_c
    real :: xiaero_c(nax)
    real :: aerodata_c(ndx, nax)
    common /ifoil_x/ naero_c
    common /rfoil_x/ xiaero_c, aerodata_c

    read(*,*) n
    read(*,*) xisect, a0, clmax, clmin, dclda, dclda_stall, dcl_stall, &
      cdmin, cldmin, dcdcl2, cmcon, mcrit, reref, rexp

    naero_c = max(n, 1)
    xiaero_c = 0.0
    aerodata_c = 0.0

    call putaero(n, xisect, a0, clmax, clmin, dclda, dclda_stall, dcl_stall, &
                 cdmin, cldmin, dcdcl2, cmcon, mcrit, reref, rexp)

    write(*,'(A)') 'RESULT putaero'
    write(*,'(14(ES24.16E3,1X))') xiaero_c(n), aerodata_c(1, n), aerodata_c(2, n), &
      aerodata_c(3, n), aerodata_c(4, n), aerodata_c(5, n), aerodata_c(6, n), &
      aerodata_c(7, n), aerodata_c(8, n), aerodata_c(9, n), aerodata_c(10, n), &
      aerodata_c(13, n), aerodata_c(11, n), aerodata_c(12, n)
  end subroutine run_putaero

  subroutine run_clcdcm()
    implicit none
    external clcdcm

    logical :: stallf
    real :: vel
    real :: vso
    real :: alf
    real :: w
    real :: rey
    real :: a0
    real :: clmax
    real :: clmin
    real :: dclda
    real :: dclda_stall
    real :: dcl_stall
    real :: cdmin
    real :: cldmin
    real :: dcdcl2
    real :: cmcon
    real :: mcrit
    real :: reref
    real :: rexp
    real :: clift
    real :: cl_alf
    real :: cl_w
    real :: cdrag
    real :: cd_alf
    real :: cd_w
    real :: cd_rey
    real :: cmom
    real :: cm_al
    real :: cm_w
    integer :: flag

    read(*,*) vel, vso
    read(*,*) alf, w, rey
    read(*,*) a0, clmax, clmin, dclda, dclda_stall, dcl_stall, cdmin, cldmin, &
      dcdcl2, cmcon, mcrit, reref, rexp

    call init_flow_state(vel, vso)
    call clcdcm(alf, w, rey, clift, cl_alf, cl_w, stallf, cdrag, cd_alf, cd_w, &
                cd_rey, cmom, cm_al, cm_w, a0, clmax, clmin, dclda, dclda_stall, &
                dcl_stall, cdmin, cldmin, dcdcl2, cmcon, mcrit, reref, rexp)

    flag = 0
    if (stallf) flag = 1
    write(*,'(A)') 'RESULT clcdcm'
    write(*,'(6(ES24.16E3,1X),I0,1X,7(ES24.16E3,1X))') clift, cl_alf, cl_w, clmax, clmin, &
      dcl_stall, flag, cdrag, cd_alf, cd_w, cd_rey, cmom, cm_al, cm_w
  end subroutine run_clcdcm

  subroutine run_getclcdcm()
    implicit none
    external getclcdcm

    logical :: stallf
    integer :: ii
    integer :: naero
    integer :: is
    integer :: i
    integer :: flag
    integer, allocatable :: iaero(:)
    real :: vel
    real :: vso
    real :: alf
    real :: w
    real :: rey
    real :: clift
    real :: cl_alf
    real :: cl_w
    real :: clmax
    real :: clmin
    real :: dcl_stall
    real :: cdrag
    real :: cd_alf
    real :: cd_w
    real :: cd_rey
    real :: cmom
    real :: cm_al
    real :: cm_w
    real, allocatable :: xi(:)
    real, allocatable :: xiaero(:)
    real, allocatable :: aerodata(:,:)

    read(*,*) ii, naero, is
    read(*,*) vel, vso
    read(*,*) alf, w, rey

    allocate(xi(ii), iaero(ii), xiaero(naero), aerodata(13, naero))

    call read_vector(xi, ii)
    call read_int_vector(iaero, ii)
    call read_vector(xiaero, naero)
    call read_matrix(aerodata, 13, naero)

    call init_flow_state(vel, vso)
    call init_aero_storage(naero, xiaero, aerodata)
    call init_aero_geom(ii, xi, iaero)
    call getclcdcm(is, alf, w, rey, clift, cl_alf, cl_w, clmax, clmin, dcl_stall, &
                   stallf, cdrag, cd_alf, cd_w, cd_rey, cmom, cm_al, cm_w)
    call sync_iaero(ii, iaero)

    flag = 0
    if (stallf) flag = 1
    write(*,'(A)') 'RESULT getclcdcm'
    write(*,'(I0)') ii
    do i = 1, ii
      write(*,'(I0)') iaero(i)
    end do
    write(*,'(6(ES24.16E3,1X),I0,1X,7(ES24.16E3,1X))') clift, cl_alf, cl_w, clmax, clmin, &
      dcl_stall, flag, cdrag, cd_alf, cd_w, cd_rey, cmom, cm_al, cm_w
  end subroutine run_getclcdcm

  subroutine run_getalf()
    implicit none
    external getalf

    logical :: stallf
    integer :: ii
    integer :: naero
    integer :: is
    integer, allocatable :: iaero(:)
    real :: vel
    real :: vso
    real :: clift
    real :: w
    real :: alf
    real :: alf_cl
    real :: alf_w
    integer :: flag
    real, allocatable :: xi(:)
    real, allocatable :: xiaero(:)
    real, allocatable :: aerodata(:,:)

    read(*,*) ii, naero, is
    read(*,*) vel, vso
    read(*,*) clift, w

    allocate(xi(ii), iaero(ii), xiaero(naero), aerodata(13, naero))

    call read_vector(xi, ii)
    call read_int_vector(iaero, ii)
    call read_vector(xiaero, naero)
    call read_matrix(aerodata, 13, naero)

    call init_flow_state(vel, vso)
    call init_aero_storage(naero, xiaero, aerodata)
    call init_aero_geom(ii, xi, iaero)
    call getalf(is, clift, w, alf, alf_cl, alf_w, stallf)

    flag = 0
    if (stallf) flag = 1
    write(*,'(A)') 'RESULT getalf'
    write(*,'(3(ES24.16E3,1X),I0)') alf, alf_cl, alf_w, flag
  end subroutine run_getalf

  subroutine run_chklim()
    implicit none
    external chklim

    integer :: n
    integer :: nstrt
    integer :: nend
    real :: fmax
    real, allocatable :: f(:)

    read(*,*) n
    read(*,*) fmax

    allocate(f(n))
    call read_vector(f, n)

    call chklim(n, nstrt, nend, f, fmax)

    write(*,'(A)') 'RESULT chklim'
    write(*,'(I0,1X,I0)') nstrt, nend
  end subroutine run_chklim

  subroutine run_ptrace()
    implicit none
    external ptrace

    integer :: nblds
    integer :: ii
    integer :: nt
    integer :: i
    integer :: it
    real :: xobs
    real :: yobs
    real :: zobs
    real :: adv
    real :: rad
    real :: vel
    real :: vso
    real :: rho
    real, allocatable :: xi(:)
    real, allocatable :: dxi(:)
    real, allocatable :: aoc(:)
    real, allocatable :: ch(:)
    real, allocatable :: gam(:)
    real, allocatable :: pres(:,:)
    real, allocatable :: time(:)

    read(*,*) nblds, ii, nt
    read(*,*) xobs, yobs, zobs
    read(*,*) adv, rad, vel, vso, rho

    allocate(xi(ii), dxi(ii), aoc(ii), ch(ii), gam(ii))
    allocate(pres(0:nt,3), time(0:nt))

    call read_vector(xi, ii)
    call read_vector(dxi, ii)
    call read_vector(aoc, ii)
    call read_vector(ch, ii)
    call read_vector(gam, ii)

    call ptrace(xobs, yobs, zobs, &
                nblds, ii, xi, dxi, aoc, ch, gam, &
                adv, rad, vel, vso, rho, &
                nt, nt, pres, time)

    write(*,'(A)') 'RESULT ptrace'
    write(*,'(I0)') nt
    do it = 0, nt
      write(*,'(ES24.16E3,1X,ES24.16E3,1X,ES24.16E3,1X,ES24.16E3)') &
        time(it), pres(it,1), pres(it,2), pres(it,3)
    end do
  end subroutine run_ptrace

  subroutine run_sft()
    implicit none
    external sft

    integer :: n
    integer :: nf
    integer :: i
    real, allocatable :: y(:)
    real, allocatable :: t(:)
    real, allocatable :: fampl(:)
    real, allocatable :: phase(:)

    read(*,*) n, nf

    allocate(y(0:n), t(0:n))
    allocate(fampl(nf), phase(nf))

    do i = 0, n
      read(*,*) y(i)
    end do
    do i = 0, n
      read(*,*) t(i)
    end do

    call sft(y, t, n, fampl, phase, nf)

    write(*,'(A)') 'RESULT sft'
    write(*,'(I0)') nf
    do i = 1, nf
      write(*,'(ES24.16E3,1X,ES24.16E3)') fampl(i), phase(i)
    end do
  end subroutine run_sft

  subroutine run_psplin()
    implicit none
    external psplin

    integer :: ii
    integer :: i
    real, allocatable :: x(:)
    real, allocatable :: xp(:)
    real, allocatable :: s(:)

    read(*,*) ii

    allocate(x(ii), xp(ii), s(ii))

    call read_vector(x, ii)
    call read_vector(s, ii)

    call psplin(x, xp, s, ii)

    write(*,'(A)') 'RESULT psplin'
    write(*,'(I0)') ii
    do i = 1, ii
      write(*,'(ES24.16E3)') xp(i)
    end do
  end subroutine run_psplin

  subroutine run_ptriso()
    implicit none
    external ptriso

    integer :: kk
    integer :: i
    real, allocatable :: a(:)
    real, allocatable :: b(:)
    real, allocatable :: c(:)
    real, allocatable :: d(:)

    read(*,*) kk

    allocate(a(kk), b(kk), c(kk), d(kk))

    call read_vector(a, kk)
    call read_vector(b, kk)
    call read_vector(c, kk)
    call read_vector(d, kk)

    call ptriso(a, b, c, d, kk)

    write(*,'(A)') 'RESULT ptriso'
    write(*,'(I0)') kk
    do i = 1, kk
      write(*,'(ES24.16E3)') d(i)
    end do
  end subroutine run_ptriso

  subroutine run_trisol()
    implicit none
    external trisol

    integer :: kk
    integer :: i
    real, allocatable :: a(:)
    real, allocatable :: b(:)
    real, allocatable :: c(:)
    real, allocatable :: d(:)

    read(*,*) kk

    allocate(a(kk), b(kk), c(kk), d(kk))

    call read_vector(a, kk)
    call read_vector(b, kk)
    call read_vector(c, kk)
    call read_vector(d, kk)

    call trisol(a, b, c, d, kk)

    write(*,'(A)') 'RESULT trisol'
    write(*,'(I0)') kk
    do i = 1, kk
      write(*,'(ES24.16E3)') d(i)
    end do
  end subroutine run_trisol

  subroutine run_spline()
    implicit none
    external spline

    integer :: n
    integer :: i
    real, allocatable :: x(:)
    real, allocatable :: xs(:)
    real, allocatable :: s(:)

    read(*,*) n

    allocate(x(n), xs(n), s(n))

    call read_vector(x, n)
    call read_vector(s, n)

    call spline(x, xs, s, n)

    write(*,'(A)') 'RESULT spline'
    write(*,'(I0)') n
    do i = 1, n
      write(*,'(ES24.16E3)') xs(i)
    end do
  end subroutine run_spline

  subroutine run_splind()
    implicit none
    external splind

    integer :: n
    integer :: i
    real :: xs1
    real :: xs2
    real, allocatable :: x(:)
    real, allocatable :: xs(:)
    real, allocatable :: s(:)

    read(*,*) n
    read(*,*) xs1, xs2

    allocate(x(n), xs(n), s(n))

    call read_vector(x, n)
    call read_vector(s, n)

    call splind(x, xs, s, n, xs1, xs2)

    write(*,'(A)') 'RESULT splind'
    write(*,'(I0)') n
    do i = 1, n
      write(*,'(ES24.16E3)') xs(i)
    end do
  end subroutine run_splind

  subroutine run_splina()
    implicit none
    external splina

    integer :: n
    integer :: i
    real, allocatable :: x(:)
    real, allocatable :: xs(:)
    real, allocatable :: s(:)

    read(*,*) n

    allocate(x(n), xs(n), s(n))

    call read_vector(x, n)
    call read_vector(s, n)

    call splina(x, xs, s, n)

    write(*,'(A)') 'RESULT splina'
    write(*,'(I0)') n
    do i = 1, n
      write(*,'(ES24.16E3)') xs(i)
    end do
  end subroutine run_splina

  subroutine run_seval()
    implicit none
    real, external :: seval

    integer :: n
    integer :: m
    integer :: i
    real, allocatable :: x(:)
    real, allocatable :: xs(:)
    real, allocatable :: s(:)
    real, allocatable :: ss(:)
    real, allocatable :: values(:)

    read(*,*) n, m

    allocate(x(n), xs(n), s(n), ss(m), values(m))

    call read_vector(x, n)
    call read_vector(xs, n)
    call read_vector(s, n)
    call read_vector(ss, m)

    do i = 1, m
      values(i) = seval(ss(i), x, xs, s, n)
    end do

    write(*,'(A)') 'RESULT seval'
    write(*,'(I0)') m
    do i = 1, m
      write(*,'(ES24.16E3)') values(i)
    end do
  end subroutine run_seval

  subroutine run_deval()
    implicit none
    real, external :: deval

    integer :: n
    integer :: m
    integer :: i
    real, allocatable :: x(:)
    real, allocatable :: xs(:)
    real, allocatable :: s(:)
    real, allocatable :: ss(:)
    real, allocatable :: values(:)

    read(*,*) n, m

    allocate(x(n), xs(n), s(n), ss(m), values(m))

    call read_vector(x, n)
    call read_vector(xs, n)
    call read_vector(s, n)
    call read_vector(ss, m)

    do i = 1, m
      values(i) = deval(ss(i), x, xs, s, n)
    end do

    write(*,'(A)') 'RESULT deval'
    write(*,'(I0)') m
    do i = 1, m
      write(*,'(ES24.16E3)') values(i)
    end do
  end subroutine run_deval

  subroutine run_d2val()
    implicit none
    real, external :: d2val

    integer :: n
    integer :: m
    integer :: i
    real, allocatable :: x(:)
    real, allocatable :: xs(:)
    real, allocatable :: s(:)
    real, allocatable :: ss(:)
    real, allocatable :: values(:)

    read(*,*) n, m

    allocate(x(n), xs(n), s(n), ss(m), values(m))

    call read_vector(x, n)
    call read_vector(xs, n)
    call read_vector(s, n)
    call read_vector(ss, m)

    do i = 1, m
      values(i) = d2val(ss(i), x, xs, s, n)
    end do

    write(*,'(A)') 'RESULT d2val'
    write(*,'(I0)') m
    do i = 1, m
      write(*,'(ES24.16E3)') values(i)
    end do
  end subroutine run_d2val

  subroutine run_sevall()
    implicit none
    external sevall

    integer :: n
    integer :: m
    integer :: i
    real :: xx
    real :: xxs
    real :: xxss
    real, allocatable :: x(:)
    real, allocatable :: xs(:)
    real, allocatable :: s(:)
    real, allocatable :: ss(:)

    read(*,*) n, m

    allocate(x(n), xs(n), s(n), ss(m))

    call read_vector(x, n)
    call read_vector(xs, n)
    call read_vector(s, n)
    call read_vector(ss, m)

    write(*,'(A)') 'RESULT sevall'
    write(*,'(I0)') m
    do i = 1, m
      call sevall(ss(i), x, xs, s, n, xx, xxs, xxss)
      write(*,'(ES24.16E3,1X,ES24.16E3,1X,ES24.16E3)') xx, xxs, xxss
    end do
  end subroutine run_sevall

  subroutine run_curv()
    implicit none
    real, external :: curv

    integer :: n
    integer :: m
    integer :: i
    real, allocatable :: x(:)
    real, allocatable :: xs(:)
    real, allocatable :: y(:)
    real, allocatable :: ys(:)
    real, allocatable :: s(:)
    real, allocatable :: ss(:)
    real, allocatable :: values(:)

    read(*,*) n, m

    allocate(x(n), xs(n), y(n), ys(n), s(n), ss(m), values(m))

    call read_vector(x, n)
    call read_vector(xs, n)
    call read_vector(y, n)
    call read_vector(ys, n)
    call read_vector(s, n)
    call read_vector(ss, m)

    do i = 1, m
      values(i) = curv(ss(i), x, xs, y, ys, s, n)
    end do

    write(*,'(A)') 'RESULT curv'
    write(*,'(I0)') m
    do i = 1, m
      write(*,'(ES24.16E3)') values(i)
    end do
  end subroutine run_curv

  subroutine run_curvs()
    implicit none
    real, external :: curvs

    integer :: n
    integer :: m
    integer :: i
    real, allocatable :: x(:)
    real, allocatable :: xs(:)
    real, allocatable :: y(:)
    real, allocatable :: ys(:)
    real, allocatable :: s(:)
    real, allocatable :: ss(:)
    real, allocatable :: values(:)

    read(*,*) n, m

    allocate(x(n), xs(n), y(n), ys(n), s(n), ss(m), values(m))

    call read_vector(x, n)
    call read_vector(xs, n)
    call read_vector(y, n)
    call read_vector(ys, n)
    call read_vector(s, n)
    call read_vector(ss, m)

    do i = 1, m
      values(i) = curvs(ss(i), x, xs, y, ys, s, n)
    end do

    write(*,'(A)') 'RESULT curvs'
    write(*,'(I0)') m
    do i = 1, m
      write(*,'(ES24.16E3)') values(i)
    end do
  end subroutine run_curvs

  subroutine run_sinvrt()
    implicit none
    external sinvrt

    integer :: n
    real :: si
    real :: xi
    real, allocatable :: x(:)
    real, allocatable :: xs(:)
    real, allocatable :: s(:)

    read(*,*) n
    read(*,*) xi, si

    allocate(x(n), xs(n), s(n))

    call read_vector(x, n)
    call read_vector(xs, n)
    call read_vector(s, n)

    call sinvrt(si, xi, x, xs, s, n)

    write(*,'(A)') 'RESULT sinvrt'
    write(*,'(ES24.16E3)') si
  end subroutine run_sinvrt

  subroutine run_scalc()
    implicit none
    external scalc

    integer :: n
    integer :: i
    real, allocatable :: x(:)
    real, allocatable :: y(:)
    real, allocatable :: s(:)

    read(*,*) n

    allocate(x(n), y(n), s(n))

    call read_vector(x, n)
    call read_vector(y, n)

    call scalc(x, y, s, n)

    write(*,'(A)') 'RESULT scalc'
    write(*,'(I0)') n
    do i = 1, n
      write(*,'(ES24.16E3)') s(i)
    end do
  end subroutine run_scalc

  subroutine run_segspl()
    implicit none
    external segspl

    integer :: n
    integer :: i
    real, allocatable :: x(:)
    real, allocatable :: xs(:)
    real, allocatable :: s(:)

    read(*,*) n

    allocate(x(n), xs(n), s(n))

    call read_vector(x, n)
    call read_vector(s, n)

    call segspl(x, xs, s, n)

    write(*,'(A)') 'RESULT segspl'
    write(*,'(I0)') n
    do i = 1, n
      write(*,'(ES24.16E3)') xs(i)
    end do
  end subroutine run_segspl

  subroutine run_inters()
    implicit none
    external inters

    logical :: ok
    integer :: flag
    integer :: n1
    integer :: n2
    real :: ss1
    real :: ss2
    real, allocatable :: x1(:)
    real, allocatable :: xs1(:)
    real, allocatable :: y1(:)
    real, allocatable :: ys1(:)
    real, allocatable :: s1(:)
    real, allocatable :: x2(:)
    real, allocatable :: xs2(:)
    real, allocatable :: y2(:)
    real, allocatable :: ys2(:)
    real, allocatable :: s2(:)

    read(*,*) n1, n2
    read(*,*) ss1, ss2

    allocate(x1(n1), xs1(n1), y1(n1), ys1(n1), s1(n1))
    allocate(x2(n2), xs2(n2), y2(n2), ys2(n2), s2(n2))

    call read_vector(x1, n1)
    call read_vector(xs1, n1)
    call read_vector(y1, n1)
    call read_vector(ys1, n1)
    call read_vector(s1, n1)
    call read_vector(x2, n2)
    call read_vector(xs2, n2)
    call read_vector(y2, n2)
    call read_vector(ys2, n2)
    call read_vector(s2, n2)

    call inters(ok, ss1, ss2, x1, xs1, y1, ys1, s1, n1, x2, xs2, y2, ys2, s2, n2)

    flag = 0
    if (ok) flag = 1
    write(*,'(A)') 'RESULT inters'
    write(*,'(I0,1X,ES24.16E3,1X,ES24.16E3)') flag, ss1, ss2
  end subroutine run_inters

  subroutine run_nearpt()
    implicit none
    external nearpt

    integer :: n
    real :: xpnt
    real :: ypnt
    real :: snear
    real, allocatable :: x(:)
    real, allocatable :: xp(:)
    real, allocatable :: y(:)
    real, allocatable :: yp(:)
    real, allocatable :: s(:)

    read(*,*) n
    read(*,*) xpnt, ypnt, snear

    allocate(x(n), xp(n), y(n), yp(n), s(n))

    call read_vector(x, n)
    call read_vector(xp, n)
    call read_vector(y, n)
    call read_vector(yp, n)
    call read_vector(s, n)

    call nearpt(xpnt, ypnt, snear, x, xp, y, yp, s, n)

    write(*,'(A)') 'RESULT nearpt'
    write(*,'(ES24.16E3)') snear
  end subroutine run_nearpt

  subroutine run_sevlin()
    implicit none
    external sevlin

    integer :: n
    integer :: m
    integer :: i
    real :: xx
    real :: xxs
    real, allocatable :: x(:)
    real, allocatable :: s(:)
    real, allocatable :: ss(:)

    read(*,*) n, m

    allocate(x(n), s(n), ss(m))

    call read_vector(x, n)
    call read_vector(s, n)
    call read_vector(ss, m)

    write(*,'(A)') 'RESULT sevlin'
    write(*,'(I0)') m
    do i = 1, m
      call sevlin(ss(i), x, s, n, xx, xxs)
      write(*,'(ES24.16E3,1X,ES24.16E3)') xx, xxs
    end do
  end subroutine run_sevlin

  subroutine run_ssevlin()
    implicit none
    real, external :: ssevlin

    integer :: n
    integer :: m
    integer :: i
    real, allocatable :: x(:)
    real, allocatable :: s(:)
    real, allocatable :: ss(:)
    real, allocatable :: values(:)

    read(*,*) n, m

    allocate(x(n), s(n), ss(m), values(m))

    call read_vector(x, n)
    call read_vector(s, n)
    call read_vector(ss, m)

    do i = 1, m
      values(i) = ssevlin(ss(i), x, s, n)
    end do

    write(*,'(A)') 'RESULT ssevlin'
    write(*,'(I0)') m
    do i = 1, m
      write(*,'(ES24.16E3)') values(i)
    end do
  end subroutine run_ssevlin

  subroutine run_dsevlin()
    implicit none
    real, external :: dsevlin

    integer :: n
    integer :: m
    integer :: i
    real, allocatable :: x(:)
    real, allocatable :: s(:)
    real, allocatable :: ss(:)
    real, allocatable :: values(:)

    read(*,*) n, m

    allocate(x(n), s(n), ss(m), values(m))

    call read_vector(x, n)
    call read_vector(s, n)
    call read_vector(ss, m)

    do i = 1, m
      values(i) = dsevlin(ss(i), x, s, n)
    end do

    write(*,'(A)') 'RESULT dsevlin'
    write(*,'(I0)') m
    do i = 1, m
      write(*,'(ES24.16E3)') values(i)
    end do
  end subroutine run_dsevlin

  subroutine run_scalit()
    implicit none
    external scalit

    integer :: ii
    integer :: i
    real :: yoff
    real :: ysf
    real, allocatable :: y(:)

    read(*,*) ii
    read(*,*) yoff

    allocate(y(ii))

    call read_vector(y, ii)
    call scalit(ii, y, yoff, ysf)

    write(*,'(A)') 'RESULT scalit'
    write(*,'(ES24.16E3)') ysf
  end subroutine run_scalit

  subroutine run_eiload()
    implicit none
    external eiload

    integer :: ii
    integer :: i
    integer :: ii_c
    integer :: iinf_c
    integer :: incr_c
    integer :: nn_c
    integer :: nblds_c
    integer :: ixspac_c
    integer :: niterd_c
    integer :: nitera_c
    real :: rad
    real :: mass
    real :: maxx
    real :: mrsq
    real :: rho_c
    real :: rmu_c
    real :: vso_c
    real :: vel_c
    real :: rad_c
    real :: gee_c
    real :: alt_c
    real, allocatable :: xi(:)
    real, allocatable :: dxi(:)
    character(len=512) :: file_name
    logical :: conv_c
    logical :: greek_c
    logical :: terse_c
    logical :: vrtx_c
    logical :: fast_c
    logical :: free_c
    logical :: duct_c
    logical :: lstruc_c
    logical :: ldesini_c
    logical :: loprini_c
    logical :: lrotor_c
    logical :: lvnorm_c
    logical :: lpwrvar_c
    logical :: wind_c
    logical :: dest_c
    logical :: desp_c
    logical :: stall_c(ix)
    logical :: legend_c
    real :: ch_c(ix)
    real :: beta_c(ix)
    real :: beta0_c(ix)
    real :: t_c(ix)
    real :: dbeta_c
    real :: xi_c(ix)
    real :: dxi_c(ix)
    real :: xi0_c
    real :: xitip_c
    real :: xinf_c
    real :: xpitch_c
    real :: xv_c(ix)
    real :: rake_c
    real :: px_c(ix)
    real :: py_c(ix)
    real :: pz_c(ix)
    real :: mx_c(ix)
    real :: my_c(ix)
    real :: mz_c(ix)
    real :: px_ty_c(ix)
    real :: px_tz_c(ix)
    real :: pz_tx_c(ix)
    real :: pz_ty_c(ix)
    real :: pz_wz_c(ix)
    real :: my_ty_c(ix)
    real :: mz_ty_c(ix)
    real :: mz_tx_c(ix)
    real :: mz_wz_c(ix)
    real :: tx_c(ixp)
    real :: ty_c(ixp)
    real :: tz_c(ixp)
    real :: wx_c(ixp)
    real :: wy_c(ixp)
    real :: wz_c(ixp)
    real :: shrx_c(ixp)
    real :: shry_c(ixp)
    real :: shrz_c(ixp)
    real :: momx_c(ixp)
    real :: momy_c(ixp)
    real :: momz_c(ixp)
    real :: eixxb_c(ix)
    real :: eiyyb_c(ix)
    real :: eab_c(ix)
    real :: gjb_c(ix)
    real :: ekb_c(ix)
    real :: mb_c(ix)
    real :: mxxb_c(ix)
    real :: xocg_c(ix)
    real :: xosc_c(ix)
    real :: rstb_c(ix)

    common /logi_x/ conv_c, greek_c, terse_c, vrtx_c, fast_c, free_c, duct_c, lstruc_c, &
                    ldesini_c, loprini_c, lrotor_c, lvnorm_c, lpwrvar_c, wind_c, dest_c, desp_c, stall_c, legend_c
    common /dime_x/ rho_c, rmu_c, vso_c, vel_c, rad_c, gee_c, alt_c
    common /icon_x/ ii_c, iinf_c, incr_c, nn_c, nblds_c, ixspac_c, niterd_c, nitera_c
    common /rgeom_x/ ch_c, beta_c, beta0_c, t_c, dbeta_c, xi_c, dxi_c, xi0_c, xitip_c, xinf_c, xpitch_c, xv_c, rake_c
    common /load_x/ px_c, py_c, pz_c, mx_c, my_c, mz_c, px_ty_c, px_tz_c, pz_tx_c, pz_ty_c, pz_wz_c, &
                    my_ty_c, mz_ty_c, mz_tx_c, mz_wz_c, tx_c, ty_c, tz_c, wx_c, wy_c, wz_c, &
                    shrx_c, shry_c, shrz_c, momx_c, momy_c, momz_c, eixxb_c, eiyyb_c, eab_c, gjb_c, ekb_c, &
                    mb_c, mxxb_c, xocg_c, xosc_c, rstb_c

    read(*,*) ii
    read(*,*) rad

    allocate(xi(ii), dxi(ii))

    call read_vector(xi, ii)
    call read_vector(dxi, ii)
    read(*,'(A)') file_name

    ii_c = ii
    iinf_c = 0
    incr_c = 1
    nn_c = 0
    nblds_c = 0
    ixspac_c = 0
    niterd_c = 0
    nitera_c = 0
    rho_c = 0.0
    rmu_c = 0.0
    vso_c = 0.0
    vel_c = 0.0
    rad_c = rad
    gee_c = 0.0
    alt_c = 0.0
    conv_c = .false.
    greek_c = .false.
    terse_c = .false.
    vrtx_c = .false.
    fast_c = .false.
    free_c = .false.
    duct_c = .false.
    lstruc_c = .false.
    ldesini_c = .false.
    loprini_c = .false.
    lrotor_c = .false.
    lvnorm_c = .false.
    lpwrvar_c = .false.
    wind_c = .false.
    dest_c = .false.
    desp_c = .false.
    legend_c = .false.

    do i = 1, ix
      stall_c(i) = .false.
      ch_c(i) = 0.0
      beta_c(i) = 0.0
      beta0_c(i) = 0.0
      t_c(i) = 0.0
      xi_c(i) = 0.0
      dxi_c(i) = 0.0
      xv_c(i) = 0.0
      px_c(i) = 0.0
      py_c(i) = 0.0
      pz_c(i) = 0.0
      mx_c(i) = 0.0
      my_c(i) = 0.0
      mz_c(i) = 0.0
      px_ty_c(i) = 0.0
      px_tz_c(i) = 0.0
      pz_tx_c(i) = 0.0
      pz_ty_c(i) = 0.0
      pz_wz_c(i) = 0.0
      my_ty_c(i) = 0.0
      mz_ty_c(i) = 0.0
      mz_tx_c(i) = 0.0
      mz_wz_c(i) = 0.0
      eixxb_c(i) = 0.0
      eiyyb_c(i) = 0.0
      eab_c(i) = 0.0
      gjb_c(i) = 0.0
      ekb_c(i) = 0.0
      mb_c(i) = 0.0
      mxxb_c(i) = 0.0
      xocg_c(i) = 0.0
      xosc_c(i) = 0.0
      rstb_c(i) = 0.0
    end do
    do i = 1, ixp
      tx_c(i) = 0.0
      ty_c(i) = 0.0
      tz_c(i) = 0.0
      wx_c(i) = 0.0
      wy_c(i) = 0.0
      wz_c(i) = 0.0
      shrx_c(i) = 0.0
      shry_c(i) = 0.0
      shrz_c(i) = 0.0
      momx_c(i) = 0.0
      momy_c(i) = 0.0
      momz_c(i) = 0.0
    end do
    dbeta_c = 0.0
    xi0_c = 0.0
    xitip_c = 1.0
    xinf_c = 0.0
    xpitch_c = 0.0
    rake_c = 0.0

    do i = 1, ii
      xi_c(i) = xi(i)
      dxi_c(i) = dxi(i)
    end do

    call eiload(trim(adjustl(file_name)))

    mass = 0.0
    mrsq = 0.0
    maxx = 0.0
    do i = 1, ii
      mass = mass + mb_c(i) * rad_c * dxi_c(i)
      mrsq = mrsq + mb_c(i) * rad_c * dxi_c(i) * (xi_c(i) * rad_c) ** 2
      maxx = maxx + mxxb_c(i) * rad_c * dxi_c(i)
    end do

    write(*,'(A)') 'RESULT eiload'
    write(*,'(I0)') ii
    write(*,'(ES24.16E3)') mass
    write(*,'(ES24.16E3)') maxx
    write(*,'(ES24.16E3)') mrsq
    write(*,'(I0)') merge(1, 0, lstruc_c)
    do i = 1, ii
      write(*,'(ES24.16E3)') eixxb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') eiyyb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') eab_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') gjb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') ekb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mxxb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') xocg_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') xosc_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') rstb_c(i)
    end do
  end subroutine run_eiload

  subroutine run_stclr()
    implicit none
    external stclr

    integer :: ii
    integer :: i
    integer :: ii_c
    integer :: iinf_c
    integer :: incr_c
    integer :: nn_c
    integer :: nblds_c
    integer :: ixspac_c
    integer :: niterd_c
    integer :: nitera_c
    real, allocatable :: tx_in(:)
    real, allocatable :: ty_in(:)
    real, allocatable :: tz_in(:)
    real, allocatable :: wx_in(:)
    real, allocatable :: wy_in(:)
    real, allocatable :: wz_in(:)
    real, allocatable :: shrx_in(:)
    real, allocatable :: shry_in(:)
    real, allocatable :: shrz_in(:)
    real, allocatable :: momx_in(:)
    real, allocatable :: momy_in(:)
    real, allocatable :: momz_in(:)
    real :: px_c(ix)
    real :: py_c(ix)
    real :: pz_c(ix)
    real :: mx_c(ix)
    real :: my_c(ix)
    real :: mz_c(ix)
    real :: px_ty_c(ix)
    real :: px_tz_c(ix)
    real :: pz_tx_c(ix)
    real :: pz_ty_c(ix)
    real :: pz_wz_c(ix)
    real :: my_ty_c(ix)
    real :: mz_ty_c(ix)
    real :: mz_tx_c(ix)
    real :: mz_wz_c(ix)
    real :: tx_c(ixp)
    real :: ty_c(ixp)
    real :: tz_c(ixp)
    real :: wx_c(ixp)
    real :: wy_c(ixp)
    real :: wz_c(ixp)
    real :: shrx_c(ixp)
    real :: shry_c(ixp)
    real :: shrz_c(ixp)
    real :: momx_c(ixp)
    real :: momy_c(ixp)
    real :: momz_c(ixp)
    real :: eixxb_c(ix)
    real :: eiyyb_c(ix)
    real :: eab_c(ix)
    real :: gjb_c(ix)
    real :: ekb_c(ix)
    real :: mb_c(ix)
    real :: mxxb_c(ix)
    real :: xocg_c(ix)
    real :: xosc_c(ix)
    real :: rstb_c(ix)

    common /icon_x/ ii_c, iinf_c, incr_c, nn_c, nblds_c, ixspac_c, niterd_c, nitera_c
    common /load_x/ px_c, py_c, pz_c, mx_c, my_c, mz_c, px_ty_c, px_tz_c, pz_tx_c, pz_ty_c, pz_wz_c, &
                    my_ty_c, mz_ty_c, mz_tx_c, mz_wz_c, tx_c, ty_c, tz_c, wx_c, wy_c, wz_c, &
                    shrx_c, shry_c, shrz_c, momx_c, momy_c, momz_c, eixxb_c, eiyyb_c, eab_c, gjb_c, ekb_c, &
                    mb_c, mxxb_c, xocg_c, xosc_c, rstb_c

    read(*,*) ii
    allocate(tx_in(ii + 1), ty_in(ii + 1), tz_in(ii + 1), wx_in(ii + 1), wy_in(ii + 1), wz_in(ii + 1))
    allocate(shrx_in(ii + 1), shry_in(ii + 1), shrz_in(ii + 1), momx_in(ii + 1), momy_in(ii + 1), momz_in(ii + 1))
    call read_vector(tx_in, ii + 1)
    call read_vector(ty_in, ii + 1)
    call read_vector(tz_in, ii + 1)
    call read_vector(wx_in, ii + 1)
    call read_vector(wy_in, ii + 1)
    call read_vector(wz_in, ii + 1)
    call read_vector(shrx_in, ii + 1)
    call read_vector(shry_in, ii + 1)
    call read_vector(shrz_in, ii + 1)
    call read_vector(momx_in, ii + 1)
    call read_vector(momy_in, ii + 1)
    call read_vector(momz_in, ii + 1)

    ii_c = ii
    iinf_c = 0
    incr_c = 1
    nn_c = 0
    nblds_c = 0
    ixspac_c = 0
    niterd_c = 0
    nitera_c = 0
    do i = 1, ii + 1
      tx_c(i) = tx_in(i)
      ty_c(i) = ty_in(i)
      tz_c(i) = tz_in(i)
      wx_c(i) = wx_in(i)
      wy_c(i) = wy_in(i)
      wz_c(i) = wz_in(i)
      shrx_c(i) = shrx_in(i)
      shry_c(i) = shry_in(i)
      shrz_c(i) = shrz_in(i)
      momx_c(i) = momx_in(i)
      momy_c(i) = momy_in(i)
      momz_c(i) = momz_in(i)
    end do

    call stclr()

    write(*,'(A)') 'RESULT stclr'
    write(*,'(I0)') ii
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') tx_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') ty_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') tz_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') wx_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') wy_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') wz_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') shrx_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') shry_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') shrz_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') momx_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') momy_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') momz_c(i)
    end do
  end subroutine run_stclr

  subroutine run_mclr()
    implicit none
    external mclr

    integer :: ii
    integer :: i
    integer :: ii_c
    integer :: iinf_c
    integer :: incr_c
    integer :: nn_c
    integer :: nblds_c
    integer :: ixspac_c
    integer :: niterd_c
    integer :: nitera_c
    real, allocatable :: mb_in(:)
    real, allocatable :: mxxb_in(:)
    real, allocatable :: ekb_in(:)
    real :: px_c(ix)
    real :: py_c(ix)
    real :: pz_c(ix)
    real :: mx_c(ix)
    real :: my_c(ix)
    real :: mz_c(ix)
    real :: px_ty_c(ix)
    real :: px_tz_c(ix)
    real :: pz_tx_c(ix)
    real :: pz_ty_c(ix)
    real :: pz_wz_c(ix)
    real :: my_ty_c(ix)
    real :: mz_ty_c(ix)
    real :: mz_tx_c(ix)
    real :: mz_wz_c(ix)
    real :: tx_c(ixp)
    real :: ty_c(ixp)
    real :: tz_c(ixp)
    real :: wx_c(ixp)
    real :: wy_c(ixp)
    real :: wz_c(ixp)
    real :: shrx_c(ixp)
    real :: shry_c(ixp)
    real :: shrz_c(ixp)
    real :: momx_c(ixp)
    real :: momy_c(ixp)
    real :: momz_c(ixp)
    real :: eixxb_c(ix)
    real :: eiyyb_c(ix)
    real :: eab_c(ix)
    real :: gjb_c(ix)
    real :: ekb_c(ix)
    real :: mb_c(ix)
    real :: mxxb_c(ix)
    real :: xocg_c(ix)
    real :: xosc_c(ix)
    real :: rstb_c(ix)

    common /icon_x/ ii_c, iinf_c, incr_c, nn_c, nblds_c, ixspac_c, niterd_c, nitera_c
    common /load_x/ px_c, py_c, pz_c, mx_c, my_c, mz_c, px_ty_c, px_tz_c, pz_tx_c, pz_ty_c, pz_wz_c, &
                    my_ty_c, mz_ty_c, mz_tx_c, mz_wz_c, tx_c, ty_c, tz_c, wx_c, wy_c, wz_c, &
                    shrx_c, shry_c, shrz_c, momx_c, momy_c, momz_c, eixxb_c, eiyyb_c, eab_c, gjb_c, ekb_c, &
                    mb_c, mxxb_c, xocg_c, xosc_c, rstb_c

    read(*,*) ii
    allocate(mb_in(ii), mxxb_in(ii), ekb_in(ii))
    call read_vector(mb_in, ii)
    call read_vector(mxxb_in, ii)
    call read_vector(ekb_in, ii)

    ii_c = ii
    iinf_c = 0
    incr_c = 1
    nn_c = 0
    nblds_c = 0
    ixspac_c = 0
    niterd_c = 0
    nitera_c = 0

    do i = 1, ii
      mb_c(i) = mb_in(i)
      mxxb_c(i) = mxxb_in(i)
      ekb_c(i) = ekb_in(i)
    end do

    call mclr()

    write(*,'(A)') 'RESULT mclr'
    write(*,'(I0)') ii
    do i = 1, ii
      write(*,'(ES24.16E3)') mb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mxxb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') ekb_c(i)
    end do
  end subroutine run_mclr

  subroutine run_stadd()
    implicit none
    external stadd

    integer :: ii
    integer :: i
    integer :: ii_c
    integer :: iinf_c
    integer :: incr_c
    integer :: nn_c
    integer :: nblds_c
    integer :: ixspac_c
    integer :: niterd_c
    integer :: nitera_c
    real :: pi
    real, allocatable :: beta_in(:)
    real, allocatable :: beta0_in(:)
    real, allocatable :: ty_in(:)
    logical :: conv_c
    logical :: greek_c
    logical :: terse_c
    logical :: vrtx_c
    logical :: fast_c
    logical :: free_c
    logical :: duct_c
    logical :: lstruc_c
    logical :: ldesini_c
    logical :: loprini_c
    logical :: lrotor_c
    logical :: lvnorm_c
    logical :: lpwrvar_c
    logical :: wind_c
    logical :: dest_c
    logical :: desp_c
    logical :: stall_c(ix)
    logical :: legend_c
    real :: ch_c(ix)
    real :: beta_c(ix)
    real :: beta0_c(ix)
    real :: t_c(ix)
    real :: dbeta_c
    real :: xi_c(ix)
    real :: dxi_c(ix)
    real :: xi0_c
    real :: xitip_c
    real :: xinf_c
    real :: xpitch_c
    real :: xv_c(ix)
    real :: rake_c
    real :: px_c(ix)
    real :: py_c(ix)
    real :: pz_c(ix)
    real :: mx_c(ix)
    real :: my_c(ix)
    real :: mz_c(ix)
    real :: px_ty_c(ix)
    real :: px_tz_c(ix)
    real :: pz_tx_c(ix)
    real :: pz_ty_c(ix)
    real :: pz_wz_c(ix)
    real :: my_ty_c(ix)
    real :: mz_ty_c(ix)
    real :: mz_tx_c(ix)
    real :: mz_wz_c(ix)
    real :: tx_c(ixp)
    real :: ty_c(ixp)
    real :: tz_c(ixp)
    real :: wx_c(ixp)
    real :: wy_c(ixp)
    real :: wz_c(ixp)
    real :: shrx_c(ixp)
    real :: shry_c(ixp)
    real :: shrz_c(ixp)
    real :: momx_c(ixp)
    real :: momy_c(ixp)
    real :: momz_c(ixp)
    real :: eixxb_c(ix)
    real :: eiyyb_c(ix)
    real :: eab_c(ix)
    real :: gjb_c(ix)
    real :: ekb_c(ix)
    real :: mb_c(ix)
    real :: mxxb_c(ix)
    real :: xocg_c(ix)
    real :: xosc_c(ix)
    real :: rstb_c(ix)

    common /logi_x/ conv_c, greek_c, terse_c, vrtx_c, fast_c, free_c, duct_c, lstruc_c, &
                    ldesini_c, loprini_c, lrotor_c, lvnorm_c, lpwrvar_c, wind_c, dest_c, desp_c, stall_c, legend_c
    common /icon_x/ ii_c, iinf_c, incr_c, nn_c, nblds_c, ixspac_c, niterd_c, nitera_c
    common /rgeom_x/ ch_c, beta_c, beta0_c, t_c, dbeta_c, xi_c, dxi_c, xi0_c, xitip_c, xinf_c, xpitch_c, xv_c, rake_c
    common /load_x/ px_c, py_c, pz_c, mx_c, my_c, mz_c, px_ty_c, px_tz_c, pz_tx_c, pz_ty_c, pz_wz_c, &
                    my_ty_c, mz_ty_c, mz_tx_c, mz_wz_c, tx_c, ty_c, tz_c, wx_c, wy_c, wz_c, &
                    shrx_c, shry_c, shrz_c, momx_c, momy_c, momz_c, eixxb_c, eiyyb_c, eab_c, gjb_c, ekb_c, &
                    mb_c, mxxb_c, xocg_c, xosc_c, rstb_c

    read(*,*) ii
    allocate(beta_in(ii), beta0_in(ii), ty_in(ii + 1))
    call read_vector(beta_in, ii)
    call read_vector(beta0_in, ii)
    call read_vector(ty_in, ii + 1)

    ii_c = ii
    iinf_c = 0
    incr_c = 1
    nn_c = 0
    nblds_c = 0
    ixspac_c = 0
    niterd_c = 0
    nitera_c = 0
    conv_c = .true.
    greek_c = .false.
    terse_c = .false.
    vrtx_c = .false.
    fast_c = .false.
    free_c = .false.
    duct_c = .false.
    lstruc_c = .false.
    ldesini_c = .false.
    loprini_c = .false.
    lrotor_c = .false.
    lvnorm_c = .false.
    lpwrvar_c = .false.
    wind_c = .false.
    dest_c = .false.
    desp_c = .false.
    legend_c = .false.
    do i = 1, ix
      stall_c(i) = .false.
      ch_c(i) = 0.0
      beta_c(i) = 0.0
      beta0_c(i) = 0.0
      t_c(i) = 0.0
      xi_c(i) = 0.0
      dxi_c(i) = 0.0
      xv_c(i) = 0.0
    end do
    do i = 1, ixp
      ty_c(i) = 0.0
    end do
    dbeta_c = 0.0
    xi0_c = 0.0
    xitip_c = 1.0
    xinf_c = 0.0
    xpitch_c = 0.0
    rake_c = 0.0

    do i = 1, ii
      beta_c(i) = beta_in(i)
      beta0_c(i) = beta0_in(i)
    end do
    do i = 1, ii + 1
      ty_c(i) = ty_in(i)
    end do

    call stadd()

    pi = 4.0 * atan(1.0)
    write(*,'(A)') 'RESULT stadd'
    write(*,'(I0)') ii
    write(*,'(ES24.16E3)') (beta_c(ii) - beta0_c(ii)) * 180.0 / pi
    do i = 1, ii
      write(*,'(ES24.16E3)') beta_c(i)
    end do
  end subroutine run_stadd

  subroutine run_stset()
    implicit none
    external stset

    integer :: ii
    integer :: i
    integer :: ii_c
    integer :: iinf_c
    integer :: incr_c
    integer :: nn_c
    integer :: nblds_c
    integer :: ixspac_c
    integer :: niterd_c
    integer :: nitera_c
    real :: pi
    real, allocatable :: beta_in(:)
    real, allocatable :: beta0_in(:)
    real, allocatable :: ty_in(:)
    logical :: conv_c
    logical :: greek_c
    logical :: terse_c
    logical :: vrtx_c
    logical :: fast_c
    logical :: free_c
    logical :: duct_c
    logical :: lstruc_c
    logical :: ldesini_c
    logical :: loprini_c
    logical :: lrotor_c
    logical :: lvnorm_c
    logical :: lpwrvar_c
    logical :: wind_c
    logical :: dest_c
    logical :: desp_c
    logical :: stall_c(ix)
    logical :: legend_c
    real :: ch_c(ix)
    real :: beta_c(ix)
    real :: beta0_c(ix)
    real :: t_c(ix)
    real :: dbeta_c
    real :: xi_c(ix)
    real :: dxi_c(ix)
    real :: xi0_c
    real :: xitip_c
    real :: xinf_c
    real :: xpitch_c
    real :: xv_c(ix)
    real :: rake_c
    real :: px_c(ix)
    real :: py_c(ix)
    real :: pz_c(ix)
    real :: mx_c(ix)
    real :: my_c(ix)
    real :: mz_c(ix)
    real :: px_ty_c(ix)
    real :: px_tz_c(ix)
    real :: pz_tx_c(ix)
    real :: pz_ty_c(ix)
    real :: pz_wz_c(ix)
    real :: my_ty_c(ix)
    real :: mz_ty_c(ix)
    real :: mz_tx_c(ix)
    real :: mz_wz_c(ix)
    real :: tx_c(ixp)
    real :: ty_c(ixp)
    real :: tz_c(ixp)
    real :: wx_c(ixp)
    real :: wy_c(ixp)
    real :: wz_c(ixp)
    real :: shrx_c(ixp)
    real :: shry_c(ixp)
    real :: shrz_c(ixp)
    real :: momx_c(ixp)
    real :: momy_c(ixp)
    real :: momz_c(ixp)
    real :: eixxb_c(ix)
    real :: eiyyb_c(ix)
    real :: eab_c(ix)
    real :: gjb_c(ix)
    real :: ekb_c(ix)
    real :: mb_c(ix)
    real :: mxxb_c(ix)
    real :: xocg_c(ix)
    real :: xosc_c(ix)
    real :: rstb_c(ix)

    common /logi_x/ conv_c, greek_c, terse_c, vrtx_c, fast_c, free_c, duct_c, lstruc_c, &
                    ldesini_c, loprini_c, lrotor_c, lvnorm_c, lpwrvar_c, wind_c, dest_c, desp_c, stall_c, legend_c
    common /icon_x/ ii_c, iinf_c, incr_c, nn_c, nblds_c, ixspac_c, niterd_c, nitera_c
    common /rgeom_x/ ch_c, beta_c, beta0_c, t_c, dbeta_c, xi_c, dxi_c, xi0_c, xitip_c, xinf_c, xpitch_c, xv_c, rake_c
    common /load_x/ px_c, py_c, pz_c, mx_c, my_c, mz_c, px_ty_c, px_tz_c, pz_tx_c, pz_ty_c, pz_wz_c, &
                    my_ty_c, mz_ty_c, mz_tx_c, mz_wz_c, tx_c, ty_c, tz_c, wx_c, wy_c, wz_c, &
                    shrx_c, shry_c, shrz_c, momx_c, momy_c, momz_c, eixxb_c, eiyyb_c, eab_c, gjb_c, ekb_c, &
                    mb_c, mxxb_c, xocg_c, xosc_c, rstb_c

    read(*,*) ii
    allocate(beta_in(ii), beta0_in(ii), ty_in(ii + 1))
    call read_vector(beta_in, ii)
    call read_vector(beta0_in, ii)
    call read_vector(ty_in, ii + 1)

    ii_c = ii
    iinf_c = 0
    incr_c = 1
    nn_c = 0
    nblds_c = 0
    ixspac_c = 0
    niterd_c = 0
    nitera_c = 0
    conv_c = .true.
    greek_c = .false.
    terse_c = .false.
    vrtx_c = .false.
    fast_c = .false.
    free_c = .false.
    duct_c = .false.
    lstruc_c = .false.
    ldesini_c = .false.
    loprini_c = .false.
    lrotor_c = .false.
    lvnorm_c = .false.
    lpwrvar_c = .false.
    wind_c = .false.
    dest_c = .false.
    desp_c = .false.
    legend_c = .false.
    do i = 1, ix
      stall_c(i) = .false.
      ch_c(i) = 0.0
      beta_c(i) = 0.0
      beta0_c(i) = 0.0
      t_c(i) = 0.0
      xi_c(i) = 0.0
      dxi_c(i) = 0.0
      xv_c(i) = 0.0
    end do
    do i = 1, ixp
      ty_c(i) = 0.0
    end do
    dbeta_c = 0.0
    xi0_c = 0.0
    xitip_c = 1.0
    xinf_c = 0.0
    xpitch_c = 0.0
    rake_c = 0.0

    do i = 1, ii
      beta_c(i) = beta_in(i)
      beta0_c(i) = beta0_in(i)
    end do
    do i = 1, ii + 1
      ty_c(i) = ty_in(i)
    end do

    call stset()

    pi = 4.0 * atan(1.0)
    write(*,'(A)') 'RESULT stset'
    write(*,'(I0)') ii
    write(*,'(ES24.16E3)') (beta_c(ii) - beta0_c(ii)) * 180.0 / pi
    do i = 1, ii
      write(*,'(ES24.16E3)') beta0_c(i)
    end do
  end subroutine run_stset

  subroutine run_b12sol()
    implicit none
    external b12sol

    integer :: ii
    integer :: i
    integer :: j
    integer :: k
    real, allocatable :: a(:,:,:)
    real, allocatable :: b(:,:,:)
    real, allocatable :: c(:,:,:)
    real, allocatable :: r(:,:,:)

    read(*,*) ii
    allocate(a(12, 12, ii), b(12, 12, ii), c(12, 12, ii), r(12, 1, ii))

    do i = 1, ii
      do j = 1, 12
        do k = 1, 12
          read(*,*) a(j, k, i)
        end do
      end do
    end do
    do i = 1, ii
      do j = 1, 12
        do k = 1, 12
          read(*,*) b(j, k, i)
        end do
      end do
    end do
    do i = 1, ii
      do j = 1, 12
        do k = 1, 12
          read(*,*) c(j, k, i)
        end do
      end do
    end do
    do i = 1, ii
      do j = 1, 12
        read(*,*) r(j, 1, i)
      end do
    end do

    call b12sol(a, b, c, r, ii)

    write(*,'(A)') 'RESULT b12sol'
    write(*,'(I0)') ii
    do i = 1, ii
      do j = 1, 12
        write(*,'(ES24.16E3)') r(j, 1, i)
      end do
    end do
  end subroutine run_b12sol

  subroutine run_stload()
    implicit none
    external stload

    integer :: ii
    integer :: incr
    integer :: lstruc_flag
    integer :: i
    real :: rad
    real :: vel
    real :: vso
    real :: rho
    real :: adv
    real :: rake
    real, allocatable :: xi(:)
    real, allocatable :: dxi(:)
    real, allocatable :: ch(:)
    real, allocatable :: beta(:)
    real, allocatable :: beta0(:)
    real, allocatable :: cl(:)
    real, allocatable :: cd(:)
    real, allocatable :: cm(:)
    real, allocatable :: eixxb(:)
    real, allocatable :: eiyyb(:)
    real, allocatable :: eab(:)
    real, allocatable :: gjb(:)
    real, allocatable :: ekb(:)
    real, allocatable :: mb(:)
    real, allocatable :: mxxb(:)
    real, allocatable :: xocg(:)
    real, allocatable :: xosc(:)
    real, allocatable :: rstb(:)
    real, allocatable :: px(:)
    real, allocatable :: py(:)
    real, allocatable :: pz(:)
    real, allocatable :: mx(:)
    real, allocatable :: my(:)
    real, allocatable :: mz(:)
    real, allocatable :: px_ty(:)
    real, allocatable :: px_tz(:)
    real, allocatable :: pz_tx(:)
    real, allocatable :: pz_ty(:)
    real, allocatable :: pz_wz(:)
    real, allocatable :: my_ty(:)
    real, allocatable :: mz_ty(:)
    real, allocatable :: mz_tx(:)
    real, allocatable :: mz_wz(:)
    real, allocatable :: tx(:)
    real, allocatable :: ty(:)
    real, allocatable :: tz(:)
    real, allocatable :: wx(:)
    real, allocatable :: wy(:)
    real, allocatable :: wz(:)
    real, allocatable :: shrx(:)
    real, allocatable :: shry(:)
    real, allocatable :: shrz(:)
    real, allocatable :: momx(:)
    real, allocatable :: momy(:)
    real, allocatable :: momz(:)
    real :: px_c(ix)
    real :: py_c(ix)
    real :: pz_c(ix)
    real :: mx_c(ix)
    real :: my_c(ix)
    real :: mz_c(ix)
    real :: px_ty_c(ix)
    real :: px_tz_c(ix)
    real :: pz_tx_c(ix)
    real :: pz_ty_c(ix)
    real :: pz_wz_c(ix)
    real :: my_ty_c(ix)
    real :: mz_ty_c(ix)
    real :: mz_tx_c(ix)
    real :: mz_wz_c(ix)
    real :: tx_c(ixp)
    real :: ty_c(ixp)
    real :: tz_c(ixp)
    real :: wx_c(ixp)
    real :: wy_c(ixp)
    real :: wz_c(ixp)
    real :: shrx_c(ixp)
    real :: shry_c(ixp)
    real :: shrz_c(ixp)
    real :: momx_c(ixp)
    real :: momy_c(ixp)
    real :: momz_c(ixp)
    real :: eixxb_c(ix)
    real :: eiyyb_c(ix)
    real :: eab_c(ix)
    real :: gjb_c(ix)
    real :: ekb_c(ix)
    real :: mb_c(ix)
    real :: mxxb_c(ix)
    real :: xocg_c(ix)
    real :: xosc_c(ix)
    real :: rstb_c(ix)

    common /load_x/ px_c, py_c, pz_c, mx_c, my_c, mz_c, px_ty_c, px_tz_c, pz_tx_c, pz_ty_c, pz_wz_c, &
                    my_ty_c, mz_ty_c, mz_tx_c, mz_wz_c, tx_c, ty_c, tz_c, wx_c, wy_c, wz_c, &
                    shrx_c, shry_c, shrz_c, momx_c, momy_c, momz_c, eixxb_c, eiyyb_c, eab_c, gjb_c, ekb_c, &
                    mb_c, mxxb_c, xocg_c, xosc_c, rstb_c

    read(*,*) ii
    read(*,*) rad, vel, vso, rho, adv, rake
    read(*,*) incr, lstruc_flag

    allocate(xi(ii), dxi(ii), ch(ii), beta(ii), beta0(ii), cl(ii), cd(ii), cm(ii))
    allocate(eixxb(ii), eiyyb(ii), eab(ii), gjb(ii), ekb(ii), mb(ii), mxxb(ii), xocg(ii), xosc(ii), rstb(ii))
    allocate(px(ii), py(ii), pz(ii), mx(ii), my(ii), mz(ii))
    allocate(px_ty(ii), px_tz(ii), pz_tx(ii), pz_ty(ii), pz_wz(ii), my_ty(ii), mz_ty(ii), mz_tx(ii), mz_wz(ii))
    allocate(tx(ii + 1), ty(ii + 1), tz(ii + 1), wx(ii + 1), wy(ii + 1), wz(ii + 1))
    allocate(shrx(ii + 1), shry(ii + 1), shrz(ii + 1), momx(ii + 1), momy(ii + 1), momz(ii + 1))

    call read_vector(xi, ii)
    call read_vector(dxi, ii)
    call read_vector(ch, ii)
    call read_vector(beta, ii)
    call read_vector(beta0, ii)
    call read_vector(cl, ii)
    call read_vector(cd, ii)
    call read_vector(cm, ii)
    call read_vector(eixxb, ii)
    call read_vector(eiyyb, ii)
    call read_vector(eab, ii)
    call read_vector(gjb, ii)
    call read_vector(ekb, ii)
    call read_vector(mb, ii)
    call read_vector(mxxb, ii)
    call read_vector(xocg, ii)
    call read_vector(xosc, ii)
    call read_vector(rstb, ii)
    call read_vector(px, ii)
    call read_vector(py, ii)
    call read_vector(pz, ii)
    call read_vector(mx, ii)
    call read_vector(my, ii)
    call read_vector(mz, ii)
    call read_vector(px_ty, ii)
    call read_vector(px_tz, ii)
    call read_vector(pz_tx, ii)
    call read_vector(pz_ty, ii)
    call read_vector(pz_wz, ii)
    call read_vector(my_ty, ii)
    call read_vector(mz_ty, ii)
    call read_vector(mz_tx, ii)
    call read_vector(mz_wz, ii)
    call read_vector(tx, ii + 1)
    call read_vector(ty, ii + 1)
    call read_vector(tz, ii + 1)
    call read_vector(wx, ii + 1)
    call read_vector(wy, ii + 1)
    call read_vector(wz, ii + 1)
    call read_vector(shrx, ii + 1)
    call read_vector(shry, ii + 1)
    call read_vector(shrz, ii + 1)
    call read_vector(momx, ii + 1)
    call read_vector(momy, ii + 1)
    call read_vector(momz, ii + 1)

    call init_xbend_state(ii, rad, vel, vso, rho, adv, rake, incr, lstruc_flag /= 0, &
                          xi, dxi, ch, beta, beta0, cl, cd, cm, eixxb, eiyyb, eab, gjb, ekb, mb, mxxb, xocg, xosc, rstb, &
                          px, py, pz, mx, my, mz, px_ty, px_tz, pz_tx, pz_ty, pz_wz, my_ty, mz_ty, mz_tx, mz_wz, &
                          tx, ty, tz, wx, wy, wz, shrx, shry, shrz, momx, momy, momz)

    call stload()

    write(*,'(A)') 'RESULT stload'
    write(*,'(I0)') ii
    do i = 1, ii
      write(*,'(ES24.16E3)') px_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') py_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') pz_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mx_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') my_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mz_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') px_ty_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') px_tz_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') pz_tx_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') pz_ty_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') pz_wz_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') my_ty_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mz_ty_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mz_tx_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mz_wz_c(i)
    end do
  end subroutine run_stload

  subroutine run_stcalc()
    implicit none
    external stcalc

    integer :: ii
    integer :: incr
    integer :: lstruc_flag
    integer :: i
    real :: rad
    real :: vel
    real :: vso
    real :: rho
    real :: adv
    real :: rake
    real, allocatable :: xi(:)
    real, allocatable :: dxi(:)
    real, allocatable :: ch(:)
    real, allocatable :: beta(:)
    real, allocatable :: beta0(:)
    real, allocatable :: cl(:)
    real, allocatable :: cd(:)
    real, allocatable :: cm(:)
    real, allocatable :: eixxb(:)
    real, allocatable :: eiyyb(:)
    real, allocatable :: eab(:)
    real, allocatable :: gjb(:)
    real, allocatable :: ekb(:)
    real, allocatable :: mb(:)
    real, allocatable :: mxxb(:)
    real, allocatable :: xocg(:)
    real, allocatable :: xosc(:)
    real, allocatable :: rstb(:)
    real, allocatable :: px(:)
    real, allocatable :: py(:)
    real, allocatable :: pz(:)
    real, allocatable :: mx(:)
    real, allocatable :: my(:)
    real, allocatable :: mz(:)
    real, allocatable :: px_ty(:)
    real, allocatable :: px_tz(:)
    real, allocatable :: pz_tx(:)
    real, allocatable :: pz_ty(:)
    real, allocatable :: pz_wz(:)
    real, allocatable :: my_ty(:)
    real, allocatable :: mz_ty(:)
    real, allocatable :: mz_tx(:)
    real, allocatable :: mz_wz(:)
    real, allocatable :: tx(:)
    real, allocatable :: ty(:)
    real, allocatable :: tz(:)
    real, allocatable :: wx(:)
    real, allocatable :: wy(:)
    real, allocatable :: wz(:)
    real, allocatable :: shrx(:)
    real, allocatable :: shry(:)
    real, allocatable :: shrz(:)
    real, allocatable :: momx(:)
    real, allocatable :: momy(:)
    real, allocatable :: momz(:)
    real :: px_c(ix)
    real :: py_c(ix)
    real :: pz_c(ix)
    real :: mx_c(ix)
    real :: my_c(ix)
    real :: mz_c(ix)
    real :: px_ty_c(ix)
    real :: px_tz_c(ix)
    real :: pz_tx_c(ix)
    real :: pz_ty_c(ix)
    real :: pz_wz_c(ix)
    real :: my_ty_c(ix)
    real :: mz_ty_c(ix)
    real :: mz_tx_c(ix)
    real :: mz_wz_c(ix)
    real :: tx_c(ixp)
    real :: ty_c(ixp)
    real :: tz_c(ixp)
    real :: wx_c(ixp)
    real :: wy_c(ixp)
    real :: wz_c(ixp)
    real :: shrx_c(ixp)
    real :: shry_c(ixp)
    real :: shrz_c(ixp)
    real :: momx_c(ixp)
    real :: momy_c(ixp)
    real :: momz_c(ixp)
    real :: eixxb_c(ix)
    real :: eiyyb_c(ix)
    real :: eab_c(ix)
    real :: gjb_c(ix)
    real :: ekb_c(ix)
    real :: mb_c(ix)
    real :: mxxb_c(ix)
    real :: xocg_c(ix)
    real :: xosc_c(ix)
    real :: rstb_c(ix)
    real :: adv_c
    real :: adw_c
    real :: adwfctr_c
    real :: rms_c
    real :: rlx_c
    real :: effinv_c
    real :: tspec_c
    real :: pspec_c
    real :: qspec_c
    real :: ttot_c
    real :: ptot_c
    real :: qtot_c
    real :: tinv_c
    real :: pinv_c
    real :: twak_c
    real :: pwak_c
    real :: tvis_c
    real :: pvis_c
    real :: gresmx_c
    real :: fresmx_c
    real :: aresmx_c

    common /load_x/ px_c, py_c, pz_c, mx_c, my_c, mz_c, px_ty_c, px_tz_c, pz_tx_c, pz_ty_c, pz_wz_c, &
                    my_ty_c, mz_ty_c, mz_tx_c, mz_wz_c, tx_c, ty_c, tz_c, wx_c, wy_c, wz_c, &
                    shrx_c, shry_c, shrz_c, momx_c, momy_c, momz_c, eixxb_c, eiyyb_c, eab_c, gjb_c, ekb_c, &
                    mb_c, mxxb_c, xocg_c, xosc_c, rstb_c
    common /oper_x/ adv_c, adw_c, adwfctr_c, rms_c, rlx_c, effinv_c, tspec_c, pspec_c, qspec_c, &
                    ttot_c, ptot_c, qtot_c, tinv_c, pinv_c, twak_c, pwak_c, tvis_c, pvis_c, gresmx_c, fresmx_c, aresmx_c

    read(*,*) ii
    read(*,*) rad, vel, vso, rho, adv, rake
    read(*,*) incr, lstruc_flag

    allocate(xi(ii), dxi(ii), ch(ii), beta(ii), beta0(ii), cl(ii), cd(ii), cm(ii))
    allocate(eixxb(ii), eiyyb(ii), eab(ii), gjb(ii), ekb(ii), mb(ii), mxxb(ii), xocg(ii), xosc(ii), rstb(ii))
    allocate(px(ii), py(ii), pz(ii), mx(ii), my(ii), mz(ii))
    allocate(px_ty(ii), px_tz(ii), pz_tx(ii), pz_ty(ii), pz_wz(ii), my_ty(ii), mz_ty(ii), mz_tx(ii), mz_wz(ii))
    allocate(tx(ii + 1), ty(ii + 1), tz(ii + 1), wx(ii + 1), wy(ii + 1), wz(ii + 1))
    allocate(shrx(ii + 1), shry(ii + 1), shrz(ii + 1), momx(ii + 1), momy(ii + 1), momz(ii + 1))

    call read_vector(xi, ii)
    call read_vector(dxi, ii)
    call read_vector(ch, ii)
    call read_vector(beta, ii)
    call read_vector(beta0, ii)
    call read_vector(cl, ii)
    call read_vector(cd, ii)
    call read_vector(cm, ii)
    call read_vector(eixxb, ii)
    call read_vector(eiyyb, ii)
    call read_vector(eab, ii)
    call read_vector(gjb, ii)
    call read_vector(ekb, ii)
    call read_vector(mb, ii)
    call read_vector(mxxb, ii)
    call read_vector(xocg, ii)
    call read_vector(xosc, ii)
    call read_vector(rstb, ii)
    call read_vector(px, ii)
    call read_vector(py, ii)
    call read_vector(pz, ii)
    call read_vector(mx, ii)
    call read_vector(my, ii)
    call read_vector(mz, ii)
    call read_vector(px_ty, ii)
    call read_vector(px_tz, ii)
    call read_vector(pz_tx, ii)
    call read_vector(pz_ty, ii)
    call read_vector(pz_wz, ii)
    call read_vector(my_ty, ii)
    call read_vector(mz_ty, ii)
    call read_vector(mz_tx, ii)
    call read_vector(mz_wz, ii)
    call read_vector(tx, ii + 1)
    call read_vector(ty, ii + 1)
    call read_vector(tz, ii + 1)
    call read_vector(wx, ii + 1)
    call read_vector(wy, ii + 1)
    call read_vector(wz, ii + 1)
    call read_vector(shrx, ii + 1)
    call read_vector(shry, ii + 1)
    call read_vector(shrz, ii + 1)
    call read_vector(momx, ii + 1)
    call read_vector(momy, ii + 1)
    call read_vector(momz, ii + 1)

    call init_xbend_state(ii, rad, vel, vso, rho, adv, rake, incr, lstruc_flag /= 0, &
                          xi, dxi, ch, beta, beta0, cl, cd, cm, eixxb, eiyyb, eab, gjb, ekb, mb, mxxb, xocg, xosc, rstb, &
                          px, py, pz, mx, my, mz, px_ty, px_tz, pz_tx, pz_ty, pz_wz, my_ty, mz_ty, mz_tx, mz_wz, &
                          tx, ty, tz, wx, wy, wz, shrx, shry, shrz, momx, momy, momz)

    call stcalc()

    write(*,'(A)') 'RESULT stcalc'
    write(*,'(I0)') ii
    write(*,'(ES24.16E3)') rms_c
    write(*,'(ES24.16E3)') rlx_c
    do i = 1, ii
      write(*,'(ES24.16E3)') xi(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') dxi(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') ch(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') beta(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') beta0(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') cl(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') cd(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') cm(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') eixxb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') eiyyb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') eab_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') gjb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') ekb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mxxb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') xocg_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') xosc_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') rstb_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') px_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') py_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') pz_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mx_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') my_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mz_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') px_ty_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') px_tz_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') pz_tx_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') pz_ty_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') pz_wz_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') my_ty_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mz_ty_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mz_tx_c(i)
    end do
    do i = 1, ii
      write(*,'(ES24.16E3)') mz_wz_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') tx_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') ty_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') tz_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') wx_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') wy_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') wz_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') shrx_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') shry_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') shrz_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') momx_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') momy_c(i)
    end do
    do i = 1, ii + 1
      write(*,'(ES24.16E3)') momz_c(i)
    end do
  end subroutine run_stcalc

  subroutine run_dbfoot()
    implicit none
    external dbfoot

    integer :: nblds
    integer :: ii
    integer :: nt
    integer :: nx
    integer :: ny
    integer :: i
    integer :: j
    real :: adv
    real :: rad
    real :: vel
    real :: vso
    real :: rho
    real :: galt
    real :: dclimb
    real :: unitl
    real, allocatable :: xi(:)
    real, allocatable :: dxi(:)
    real, allocatable :: aoc(:)
    real, allocatable :: ch(:)
    real, allocatable :: gam(:)
    real, allocatable :: x(:,:)
    real, allocatable :: y(:,:)
    real, allocatable :: d(:,:)

    read(*,*) nblds, ii, nt, nx, ny
    read(*,*) adv, rad, vel, vso, rho
    read(*,*) galt, dclimb, unitl

    allocate(xi(ii), dxi(ii), aoc(ii), ch(ii), gam(ii))
    allocate(x(nx,ny), y(nx,ny), d(nx,ny))

    call read_vector(xi, ii)
    call read_vector(dxi, ii)
    call read_vector(aoc, ii)
    call read_vector(ch, ii)
    call read_vector(gam, ii)

    do i = 1, nx
      do j = 1, ny
        read(*,*) x(i,j)
      end do
    end do
    do i = 1, nx
      do j = 1, ny
        read(*,*) y(i,j)
      end do
    end do

    call dbfoot(nblds, ii, xi, dxi, aoc, ch, gam, &
                adv, rad, vel, vso, rho, &
                galt, dclimb, unitl, nt, &
                nx, ny, nx, ny, x, y, d)

    write(*,'(A)') 'RESULT dbfoot'
    write(*,'(I0,1X,I0)') nx, ny
    do i = 1, nx
      do j = 1, ny
        write(*,'(ES24.16E3)') d(i,j)
      end do
    end do
  end subroutine run_dbfoot

end program xnoise_driver

subroutine cscalc(i, utot, wa, wt, vt, vt_adw, va, va_adw, vd, vd_adw, ci, ci_adv, ci_vt, si, si_va, w, w_adv, w_vt, w_va, phi, p_adv, p_vt, p_va)
  implicit none

  integer, parameter :: ix = 100
  integer, intent(in) :: i
  real, intent(out) :: utot
  real, intent(out) :: wa
  real, intent(out) :: wt
  real, intent(out) :: vt
  real, intent(out) :: vt_adw
  real, intent(out) :: va
  real, intent(out) :: va_adw
  real, intent(out) :: vd
  real, intent(out) :: vd_adw
  real, intent(out) :: ci
  real, intent(out) :: ci_adv
  real, intent(out) :: ci_vt
  real, intent(out) :: si
  real, intent(out) :: si_va
  real, intent(out) :: w
  real, intent(out) :: w_adv
  real, intent(out) :: w_vt
  real, intent(out) :: w_va
  real, intent(out) :: phi
  real, intent(out) :: p_adv
  real, intent(out) :: p_vt
  real, intent(out) :: p_va

  real :: ch_c(ix)
  real :: beta_c(ix)
  real :: beta0_c(ix)
  real :: t_c(ix)
  real :: dbeta_c
  real :: xi_c(ix)
  real :: dxi_c(ix)
  real :: xi0_c
  real :: xitip_c
  real :: xinf_c
  real :: xpitch_c
  real :: xv_c(ix)
  real :: rake_c
  real :: adv_c
  real :: adw_c
  real :: adwfctr_c
  real :: rms_c
  real :: rlx_c
  real :: effinv_c
  real :: tspec_c
  real :: pspec_c
  real :: qspec_c
  real :: ttot_c
  real :: ptot_c
  real :: qtot_c
  real :: tinv_c
  real :: pinv_c
  real :: twak_c
  real :: pwak_c
  real :: tvis_c
  real :: pvis_c
  real :: gresmx_c
  real :: fresmx_c
  real :: aresmx_c
  real :: wsq

  common /rgeom_x/ ch_c, beta_c, beta0_c, t_c, dbeta_c, xi_c, dxi_c, xi0_c, xitip_c, xinf_c, xpitch_c, xv_c, rake_c
  common /oper_x/ adv_c, adw_c, adwfctr_c, rms_c, rlx_c, effinv_c, tspec_c, pspec_c, qspec_c, &
                  ttot_c, ptot_c, qtot_c, tinv_c, pinv_c, twak_c, pwak_c, tvis_c, pvis_c, gresmx_c, fresmx_c, aresmx_c

  utot = 1.0 + 0.02 * real(i)
  wa = 0.01 * xi_c(i)
  wt = -0.015 * real(i)
  vt = 0.02 + 0.01 * real(i)
  vt_adw = -0.005 * real(i)
  va = -0.01 + 0.008 * real(i)
  va_adw = 0.003 * real(i)
  vd = 0.004 * real(i)
  vd_adw = -0.002 * real(i)
  ci = xi_c(i) / adv_c + 0.03 * real(i)
  ci_adv = -xi_c(i) / (adv_c ** 2)
  ci_vt = -1.0
  si = 0.55 + 0.025 * real(i)
  si_va = 1.1
  wsq = ci * ci + si * si
  w = sqrt(wsq)
  w_adv = (ci * ci_adv) / w
  w_vt = (ci * ci_vt) / w
  w_va = (si * si_va) / w
  phi = atan2(si, ci)
  p_adv = (-si * ci_adv) / wsq
  p_vt = (-si * ci_vt) / wsq
  p_va = (ci * si_va) / wsq
end subroutine cscalc

subroutine asks(prompt, answer)
  implicit none
  character(len=*), intent(in) :: prompt
  character(len=*), intent(inout) :: answer

  continue
end subroutine asks
