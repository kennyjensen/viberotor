module xoper_common_mod
  implicit none

  integer, parameter :: IX = 100
  integer, parameter :: IXP = IX + 1
  integer, parameter :: NPARX = 12
  integer, parameter :: ICASX = 100
  integer, parameter :: NAX = 20
  integer, parameter :: NDX = 14
  integer, parameter :: IQ = IX + 5
  real, parameter :: PI = 3.141592654

  logical :: CONV
  logical :: GREEK
  logical :: TERSE
  logical :: VRTX
  logical :: FAST
  logical :: FREE
  logical :: DUCT
  logical :: LSTRUC
  logical :: WIND
  logical :: DEST
  logical :: DESP
  logical :: STALL(IX)
  logical :: LDESINI
  logical :: LOPRINI
  logical :: LROTOR
  logical :: LVNORM
  logical :: LPWRVAR
  logical :: LEGEND

  character(len=80) :: SAVFIL
  character(len=80) :: FNAME
  character(len=32) :: NAME

  integer :: LUREAD
  integer :: LUWRIT
  integer :: LUTEMP
  integer :: LUSAVE

  real :: RHO
  real :: RMU
  real :: VSO
  real :: VEL
  real :: RAD
  real :: GEE
  real :: ALT

  integer :: II
  integer :: IINF
  integer :: INCR
  integer :: NN
  integer :: NBLDS
  integer :: IXSPAC
  integer :: NITERD
  integer :: NITERA

  real :: VERSION
  real :: DT

  integer :: IAERO(IX)

  real :: CH(IX)
  real :: BETA(IX)
  real :: BETA0(IX)
  real :: T(IX)
  real :: DBETA
  real :: XI(IX)
  real :: DXI(IX)
  real :: XI0
  real :: XITIP
  real :: XINF
  real :: XPITCH
  real :: XV(IXP)
  real :: RAKE

  integer :: NADD

  real :: RADD(IX)
  real :: UADD(IX)
  real :: VADD(IX)
  real :: UADDR(IX)
  real :: VADDR(IX)
  real :: UBODY(IX)
  real :: VBODY(IX)
  real :: URDUCT

  real :: CL(IX)
  real :: CD(IX)
  real :: CM(IX)
  real :: RE(IX)
  real :: EFFP(IX)
  real :: GAM(IX)
  real :: DTII(IX)
  real :: DPII(IX)
  real :: DTVI(IX)
  real :: DPVI(IX)
  real :: DTWI(IX)
  real :: DPWI(IX)

  integer :: NAERO
  real :: XIAERO(NAX)
  real :: AERODATA(NDX, NAX)

  integer :: NCASE
  integer :: KCASE
  integer :: IWTYP

  real :: ADV
  real :: ADW
  real :: ADWFCTR
  real :: RMS
  real :: RLX
  real :: EFFINV
  real :: TSPEC
  real :: PSPEC
  real :: QSPEC
  real :: TTOT
  real :: PTOT
  real :: QTOT
  real :: TINV
  real :: PINV
  real :: TWAK
  real :: PWAK
  real :: TVIS
  real :: PVIS
  real :: GRESMX
  real :: FRESMX
  real :: ARESMX

  real :: TI_ADV
  real :: PI_ADV
  real :: TI_ADW
  real :: PI_ADW
  real :: TW_ADV
  real :: PW_ADV
  real :: TW_ADW
  real :: PW_ADW
  real :: TV_ADV
  real :: PV_ADV
  real :: TV_ADW
  real :: PV_ADW
  real :: TV_DBE
  real :: PV_DBE
  real :: TI_GAM(IX)
  real :: PI_GAM(IX)
  real :: TW_GAM(IX)
  real :: PW_GAM(IX)
  real :: TV_GAM(IX)
  real :: PV_GAM(IX)

  integer :: NPWRVAR
  real :: RPMVAR(IX)
  real :: PWRVAR(IX)
  real :: XPWRVAR(IX)

  real :: VWAK(IX)
  real :: VW_GAM(IX, IX)
  real :: VW_ADW(IX)
  real :: VW_ADV(IX)
  real :: VIND(3, IX)
  real :: VIND_GAM(3, IX, IX)
  real :: VIND_ADW(3, IX)

  real :: XW0
  real :: XWTIP
  real :: XW(IX)
  real :: XW_GAM(IX, IX)
  real :: XW_ADW(IX)
  real :: XW_ADV(IX)
  real :: DXW(IX)
  real :: DXW_GAM(IX, IX)
  real :: DXW_ADW(IX)
  real :: DXW_ADV(IX)

  real :: DGAM(IX)
  real :: RES(IQ)
  real :: DADV
  real :: DADW
  real :: DBET
  real :: DEFF
  real :: DQ(IQ)
  real :: DGAMOLD(IX)

  common /UNIT_X/ LUREAD, LUWRIT, LUTEMP, LUSAVE
  common /LOGI_X/ CONV, GREEK, TERSE, VRTX, FAST, FREE, DUCT, LSTRUC, &
    LDESINI, LOPRINI, LROTOR, LVNORM, LPWRVAR, WIND, DEST, DESP, STALL, LEGEND
  common /CHAR_X/ SAVFIL, FNAME, NAME
  common /DIME_X/ RHO, RMU, VSO, VEL, RAD, GEE, ALT
  common /ICON_X/ II, IINF, INCR, NN, NBLDS, IXSPAC, NITERD, NITERA
  common /RCON_X/ VERSION, DT
  common /IGEOM_X/ IAERO
  common /RGEOM_X/ CH, BETA, BETA0, T, DBETA, XI, DXI, XI0, XITIP, XINF, &
    XPITCH, XV, RAKE
  common /IVELS_X/ NADD
  common /RVELS_X/ RADD, UADD, VADD, UADDR, VADDR, UBODY, VBODY, URDUCT
  common /AERO_X/ CL, CD, CM, RE, EFFP, GAM, DTII, DPII, DTVI, DPVI, DTWI, DPWI
  common /IFOIL_X/ NAERO
  common /RFOIL_X/ XIAERO, AERODATA
  common /ICAS_X/ NCASE, KCASE, IWTYP
  common /OPER_X/ ADV, ADW, ADWFCTR, RMS, RLX, EFFINV, TSPEC, PSPEC, QSPEC, &
    TTOT, PTOT, QTOT, TINV, PINV, TWAK, PWAK, TVIS, PVIS, GRESMX, FRESMX, ARESMX
  common /SENS_X/ TI_ADV, PI_ADV, TI_ADW, PI_ADW, TW_ADV, PW_ADV, TW_ADW, &
    PW_ADW, TV_ADV, PV_ADV, TV_ADW, PV_ADW, TV_DBE, PV_DBE, TI_GAM, PI_GAM, &
    TW_GAM, PW_GAM, TV_GAM, PV_GAM
  common /IPVAR_X/ NPWRVAR
  common /RPVAR_X/ RPMVAR, PWRVAR, XPWRVAR
  common /VIND_X/ VWAK, VW_GAM, VW_ADW, VW_ADV, VIND, VIND_GAM, VIND_ADW
  common /XWAK_X/ XW0, XWTIP, XW, XW_GAM, XW_ADW, XW_ADV, DXW, DXW_GAM, &
    DXW_ADW, DXW_ADV
  common /DELT_X/ DGAM, RES, DADV, DADW, DBET, DEFF, DQ, DGAMOLD
end module xoper_common_mod


program xoper_driver
  use xoper_common_mod
  implicit none

  character(len=32) :: command

  call get_command_argument(1, command)

  select case (trim(adjustl(command)))
  case ('gradmo', 'GRADMO')
    call run_gradmo()
  case ('helico', 'HELICO')
    call run_helico()
  case ('filter', 'FILTER')
    call run_filter()
  case ('cscalc', 'CSCALC')
    call run_cscalc()
  case ('vcalc', 'VCALC')
    call run_vcalc()
  case ('xwinit', 'XWINIT')
    call run_xwinit()
  case ('setxw', 'SETXW')
    call run_setxw()
  case ('tpq', 'TPQ')
    call run_tpq()
  case ('apinit', 'APINIT')
    call run_apinit()
  case ('aper', 'APER')
    call run_aper()
  case default
    write(*,'(A)') 'unknown command'
    stop 1
  end select

contains

  subroutine read_vector(values, n)
    implicit none
    integer, intent(in) :: n
    real, intent(out) :: values(:)
    integer :: i

    do i = 1, n
      read(*,*) values(i)
    end do
  end subroutine read_vector

  subroutine read_int_vector(values, n)
    implicit none
    integer, intent(in) :: n
    integer, intent(out) :: values(:)
    integer :: i

    do i = 1, n
      read(*,*) values(i)
    end do
  end subroutine read_int_vector

  subroutine read_matrix(values, nrows, ncols)
    implicit none
    integer, intent(in) :: nrows
    integer, intent(in) :: ncols
    real, intent(out) :: values(:, :)
    integer :: i
    integer :: j

    do i = 1, nrows
      do j = 1, ncols
        read(*,*) values(i, j)
      end do
    end do
  end subroutine read_matrix

  subroutine read_tensor3(values, depth, rows, cols)
    implicit none
    integer, intent(in) :: depth
    integer, intent(in) :: rows
    integer, intent(in) :: cols
    real, intent(out) :: values(:, :, :)
    integer :: i
    integer :: j
    integer :: k

    do k = 1, depth
      do i = 1, rows
        do j = 1, cols
          read(*,*) values(k, i, j)
        end do
      end do
    end do
  end subroutine read_tensor3

  subroutine write_real_value(value)
    implicit none
    real, intent(in) :: value

    write(*,'(ES25.16E3)') value
  end subroutine write_real_value

  subroutine write_int_value(value)
    implicit none
    integer, intent(in) :: value

    write(*,'(I0)') value
  end subroutine write_int_value

  subroutine write_vector(values, n)
    implicit none
    integer, intent(in) :: n
    real, intent(in) :: values(:)
    integer :: i

    do i = 1, n
      call write_real_value(values(i))
    end do
  end subroutine write_vector

  subroutine write_matrix(values, nrows, ncols)
    implicit none
    integer, intent(in) :: nrows
    integer, intent(in) :: ncols
    real, intent(in) :: values(:, :)
    integer :: i
    integer :: j

    do i = 1, nrows
      do j = 1, ncols
        call write_real_value(values(i, j))
      end do
    end do
  end subroutine write_matrix

  subroutine write_tensor3(values, depth, rows, cols)
    implicit none
    integer, intent(in) :: depth
    integer, intent(in) :: rows
    integer, intent(in) :: cols
    real, intent(in) :: values(:, :, :)
    integer :: i
    integer :: j
    integer :: k

    do k = 1, depth
      do i = 1, rows
        do j = 1, cols
          call write_real_value(values(k, i, j))
        end do
      end do
    end do
  end subroutine write_tensor3

  subroutine reset_state()
    implicit none

    CONV = .FALSE.
    GREEK = .FALSE.
    TERSE = .FALSE.
    VRTX = .FALSE.
    FAST = .TRUE.
    FREE = .FALSE.
    DUCT = .FALSE.
    LSTRUC = .FALSE.
    WIND = .FALSE.
    DEST = .FALSE.
    DESP = .FALSE.
    STALL = .FALSE.
    LDESINI = .FALSE.
    LOPRINI = .FALSE.
    LROTOR = .FALSE.
    LVNORM = .FALSE.
    LPWRVAR = .FALSE.
    LEGEND = .FALSE.
    SAVFIL = ' '
    FNAME = ' '
    NAME = ' '
    LUREAD = 5
    LUWRIT = 6
    LUTEMP = 0
    LUSAVE = 0
    RHO = 1.0
    RMU = 1.8E-5
    VSO = 340.0
    VEL = 1.0
    RAD = 1.0
    GEE = 9.81
    ALT = 0.0
    II = 0
    IINF = 0
    INCR = 1
    NN = 0
    NBLDS = 2
    IXSPAC = 1
    NITERD = 0
    NITERA = 10
    VERSION = 0.0
    DT = 0.0
    IAERO = 0
    CH = 0.0
    BETA = 0.0
    BETA0 = 0.0
    T = 0.0
    DBETA = 0.0
    XI = 0.0
    DXI = 0.0
    XI0 = 0.0
    XITIP = 0.0
    XINF = 0.0
    XPITCH = 0.0
    XV = 0.0
    RAKE = 0.0
    NADD = 0
    RADD = 0.0
    UADD = 0.0
    VADD = 0.0
    UADDR = 0.0
    VADDR = 0.0
    UBODY = 0.0
    VBODY = 0.0
    URDUCT = 1.0
    CL = 0.0
    CD = 0.0
    CM = 0.0
    RE = 0.0
    EFFP = 0.0
    GAM = 0.0
    DTII = 0.0
    DPII = 0.0
    DTVI = 0.0
    DPVI = 0.0
    DTWI = 0.0
    DPWI = 0.0
    NAERO = 0
    XIAERO = 0.0
    AERODATA = 0.0
    NCASE = 0
    KCASE = 0
    IWTYP = 0
    ADV = 1.0
    ADW = 1.0
    ADWFCTR = 1.0
    RMS = 0.0
    RLX = 1.0
    EFFINV = 0.0
    TSPEC = 0.0
    PSPEC = 0.0
    QSPEC = 0.0
    TTOT = 0.0
    PTOT = 0.0
    QTOT = 0.0
    TINV = 0.0
    PINV = 0.0
    TWAK = 0.0
    PWAK = 0.0
    TVIS = 0.0
    PVIS = 0.0
    GRESMX = 0.0
    FRESMX = 0.0
    ARESMX = 0.0
    TI_ADV = 0.0
    PI_ADV = 0.0
    TI_ADW = 0.0
    PI_ADW = 0.0
    TW_ADV = 0.0
    PW_ADV = 0.0
    TW_ADW = 0.0
    PW_ADW = 0.0
    TV_ADV = 0.0
    PV_ADV = 0.0
    TV_ADW = 0.0
    PV_ADW = 0.0
    TV_DBE = 0.0
    PV_DBE = 0.0
    TI_GAM = 0.0
    PI_GAM = 0.0
    TW_GAM = 0.0
    PW_GAM = 0.0
    TV_GAM = 0.0
    PV_GAM = 0.0
    NPWRVAR = 0
    RPMVAR = 0.0
    PWRVAR = 0.0
    XPWRVAR = 0.0
    VWAK = 0.0
    VW_GAM = 0.0
    VW_ADW = 0.0
    VW_ADV = 0.0
    VIND = 0.0
    VIND_GAM = 0.0
    VIND_ADW = 0.0
    XW0 = 0.0
    XWTIP = 0.0
    XW = 0.0
    XW_GAM = 0.0
    XW_ADW = 0.0
    XW_ADV = 0.0
    DXW = 0.0
    DXW_GAM = 0.0
    DXW_ADW = 0.0
    DXW_ADV = 0.0
    DGAM = 0.0
    RES = 0.0
    DADV = 0.0
    DADW = 0.0
    DBET = 0.0
    DEFF = 0.0
    DQ = 0.0
    DGAMOLD = 0.0
  end subroutine reset_state

  subroutine load_state()
    implicit none
    integer :: duct_flag
    integer :: fast_flag
    integer :: free_flag
    integer :: vrtx_flag
    integer :: power_flag

    call reset_state()

    read(*,*) II
    read(*,*) RAD, VEL, VSO, RHO, RMU, ADV, ADW, RAKE, URDUCT, XW0, ADWFCTR
    read(*,*) NBLDS, duct_flag, fast_flag, free_flag, vrtx_flag, NAERO, NADD, NITERA
    read(*,*) TSPEC, PSPEC, QSPEC

    DUCT = duct_flag .NE. 0
    FAST = fast_flag .NE. 0
    FREE = free_flag .NE. 0
    VRTX = vrtx_flag .NE. 0

    if (II .GT. 0) then
      call read_vector(XI, II)
      call read_vector(DXI, II)
      call read_vector(XV, II + 1)
      call read_vector(CH, II)
      call read_vector(BETA, II)
      call read_vector(BETA0, II)
      call read_vector(UBODY, II)
      call read_vector(CL, II)
      call read_vector(CD, II)
      call read_vector(CM, II)
      call read_vector(GAM, II)
      call read_vector(DGAMOLD, II)
      call read_int_vector(IAERO, II)
      call read_vector(XIAERO, NAERO)
      call read_matrix(AERODATA, 13, NAERO)
      if (NADD .GT. 0) then
        call read_vector(RADD, NADD)
        call read_vector(UADD, NADD)
        call read_vector(VADD, NADD)
        call read_vector(UADDR, NADD)
        call read_vector(VADDR, NADD)
      end if
      call read_tensor3(VIND_GAM, 3, II, II)
      call read_matrix(VIND_ADW, 3, II)
      XI0 = XV(1)
      XITIP = XV(II + 1)
    end if
    read(*,*) power_flag, NPWRVAR
    LPWRVAR = power_flag /= 0
    if (NPWRVAR > 0) then
      call read_vector(RPMVAR, NPWRVAR)
      call read_vector(PWRVAR, NPWRVAR)
      call read_vector(XPWRVAR, NPWRVAR)
    end if
  end subroutine load_state

  subroutine run_gradmo()
    implicit none

    call load_state()
    call gradmo(IX, II, NBLDS, DUCT, RAKE, XI, XV, GAM, ADW, VIND_GAM, VIND_ADW)

    write(*,'(A)') 'RESULT gradmo'
    call write_int_value(II)
    call write_tensor3(VIND_GAM, 3, II, II)
    call write_matrix(VIND_ADW, 3, II)
  end subroutine run_gradmo

  subroutine run_helico()
    implicit none

    call load_state()
    call helico(IX, II, NBLDS, DUCT, RAKE, XI, XV, GAM, ADW, VIND_GAM, VIND_ADW)

    write(*,'(A)') 'RESULT helico'
    call write_int_value(II)
    call write_tensor3(VIND_GAM, 3, II, II)
    call write_matrix(VIND_ADW, 3, II)
  end subroutine run_helico

  subroutine run_filter()
    implicit none
    integer, parameter :: NMAX = 500
    integer :: n
    real :: smlen
    real :: qv(NMAX)

    qv = 0.0
    read(*,*) n
    read(*,*) smlen
    call read_vector(qv, n)
    call filter(qv, smlen, n)

    write(*,'(A)') 'RESULT filter'
    call write_int_value(n)
    call write_vector(qv, n)
  end subroutine run_filter

  subroutine run_cscalc()
    implicit none
    integer :: i
    real :: utot
    real :: wa
    real :: wt
    real :: vt
    real :: vt_adw
    real :: va
    real :: va_adw
    real :: vd
    real :: vd_adw
    real :: ci
    real :: ci_adv
    real :: ci_vt
    real :: si
    real :: si_va
    real :: w
    real :: w_adv
    real :: w_vt
    real :: w_va
    real :: phi
    real :: p_adv
    real :: p_vt
    real :: p_va

    call load_state()
    read(*,*) i
    call vcalc()
    call cscalc(i, utot, wa, wt, vt, vt_adw, va, va_adw, vd, vd_adw, &
      ci, ci_adv, ci_vt, si, si_va, w, w_adv, w_vt, w_va, phi, p_adv, p_vt, p_va)

    write(*,'(A)') 'RESULT cscalc'
    call write_real_value(utot)
    call write_real_value(wa)
    call write_real_value(wt)
    call write_real_value(vt)
    call write_real_value(vt_adw)
    call write_real_value(va)
    call write_real_value(va_adw)
    call write_real_value(vd)
    call write_real_value(vd_adw)
    call write_real_value(ci)
    call write_real_value(ci_adv)
    call write_real_value(ci_vt)
    call write_real_value(si)
    call write_real_value(si_va)
    call write_real_value(w)
    call write_real_value(w_adv)
    call write_real_value(w_vt)
    call write_real_value(w_va)
    call write_real_value(phi)
    call write_real_value(p_adv)
    call write_real_value(p_vt)
    call write_real_value(p_va)
  end subroutine run_cscalc

  subroutine run_vcalc()
    implicit none

    call load_state()
    call vcalc()

    write(*,'(A)') 'RESULT vcalc'
    call write_int_value(II)
    call write_matrix(VIND, 3, II)
  end subroutine run_vcalc

  subroutine run_xwinit()
    implicit none

    call load_state()
    call vcalc()
    call xwinit()

    write(*,'(A)') 'RESULT xwinit'
    call write_int_value(II)
    call write_vector(XW, II)
    call write_vector(DXW, II)
    call write_vector(VWAK, II)
    call write_vector(VW_ADW, II)
    call write_real_value(XWTIP)
  end subroutine run_xwinit

  subroutine run_setxw()
    implicit none

    call load_state()
    call vcalc()
    call setxw()

    write(*,'(A)') 'RESULT setxw'
    call write_int_value(II)
    call write_vector(XW, II)
    call write_vector(DXW, II)
    call write_vector(VWAK, II)
    call write_vector(XW_ADV, II)
    call write_vector(XW_ADW, II)
    call write_vector(DXW_ADV, II)
    call write_vector(DXW_ADW, II)
    call write_vector(VW_ADV, II)
    call write_vector(VW_ADW, II)
    call write_real_value(XWTIP)
  end subroutine run_setxw

  subroutine run_tpq()
    implicit none
    integer :: itype

    call load_state()
    read(*,*) itype
    call vcalc()
    call setxw()
    call tpq(itype)

    write(*,'(A)') 'RESULT tpq'
    call write_int_value(II)
    call write_real_value(TINV)
    call write_real_value(PINV)
    call write_real_value(TWAK)
    call write_real_value(PWAK)
    call write_real_value(TVIS)
    call write_real_value(PVIS)
    call write_real_value(TTOT)
    call write_real_value(PTOT)
    call write_real_value(QTOT)
    call write_real_value(TI_ADV)
    call write_real_value(PI_ADV)
    call write_real_value(TW_ADV)
    call write_real_value(PW_ADV)
    call write_real_value(TV_ADV)
    call write_real_value(PV_ADV)
    call write_real_value(TV_DBE)
    call write_real_value(PV_DBE)
    call write_real_value(TI_ADW)
    call write_real_value(PI_ADW)
    call write_real_value(TW_ADW)
    call write_real_value(PW_ADW)
    call write_real_value(TV_ADW)
    call write_real_value(PV_ADW)
    call write_vector(CH, II)
    call write_vector(BETA, II)
    call write_vector(BETA0, II)
    call write_vector(CL, II)
    call write_vector(CD, II)
    call write_vector(CM, II)
    call write_vector(RE, II)
    call write_vector(EFFP, II)
    call write_vector(DTII, II)
    call write_vector(DPII, II)
    call write_vector(DTWI, II)
    call write_vector(DPWI, II)
    call write_vector(DTVI, II)
    call write_vector(DPVI, II)
    call write_vector(TI_GAM, II)
    call write_vector(PI_GAM, II)
    call write_vector(TW_GAM, II)
    call write_vector(PW_GAM, II)
    call write_vector(TV_GAM, II)
    call write_vector(PV_GAM, II)
  end subroutine run_tpq

  subroutine run_apinit()
    implicit none

    call load_state()
    call apinit()

    write(*,'(A)') 'RESULT apinit'
    call write_int_value(II)
    call write_real_value(ADW)
    call write_vector(GAM, II)
    call write_vector(CL, II)
    call write_vector(CD, II)
    call write_vector(CM, II)
  end subroutine run_apinit

  subroutine run_aper()
    implicit none
    integer :: ispec
    integer :: icon
    integer :: linit_flag
    logical :: linit

    call load_state()
    read(*,*) ispec
    read(*,*) icon
    read(*,*) linit_flag
    linit = linit_flag .NE. 0
    call aper(ispec, icon, linit)

    write(*,'(A)') 'RESULT aper'
    call write_int_value(II)
    if (CONV) then
      call write_int_value(1)
    else
      call write_int_value(0)
    end if
    call write_int_value(IWTYP)
    call write_real_value(ADV)
    call write_real_value(ADW)
    call write_real_value(DBETA)
    call write_real_value(RMS)
    call write_real_value(RLX)
    call write_real_value(GRESMX)
    call write_real_value(FRESMX)
    call write_real_value(ARESMX)
    call write_real_value(TTOT)
    call write_real_value(PTOT)
    call write_real_value(QTOT)
    call write_real_value(TINV)
    call write_real_value(PINV)
    call write_real_value(TWAK)
    call write_real_value(PWAK)
    call write_real_value(TVIS)
    call write_real_value(PVIS)
    call write_vector(BETA, II)
    call write_vector(BETA0, II)
    call write_vector(GAM, II)
    call write_vector(CL, II)
    call write_vector(CD, II)
    call write_vector(CM, II)
    call write_vector(DGAMOLD, II)
    call write_real_value(PSPEC)
  end subroutine run_aper
end program xoper_driver


subroutine uvadd(xiw, wa, wt)
  use xoper_common_mod
  implicit none

  real, intent(in) :: xiw
  real, intent(out) :: wa
  real, intent(out) :: wt
  real :: rdim
  real, external :: seval

  wa = 0.0
  wt = 0.0

  if (NADD .LE. 1) return

  rdim = xiw * RAD
  if (rdim .GE. RADD(1) .AND. rdim .LE. RADD(NADD)) then
    wa = seval(rdim, UADD, UADDR, RADD, NADD) / VEL
    wt = seval(rdim, VADD, VADDR, RADD, NADD) / VEL
  end if
end subroutine uvadd
